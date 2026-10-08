// The Supabase store. Listings, saved rows and recently-viewed rows live in the
// three tables of supabase/schema.sql, so they survive restarts and redeploys.
//
// Searching happens in this process: the listings (a few hundred rows) are
// fetched once and cached for a minute, then searched with the same synonym /
// partial-match rules as the in-memory store. Saved and recently-viewed rows
// are read and written straight through to the database on every request.

import { HttpError, StoreUnavailable } from "@/lib/errors";
import { toListing, type RawListing } from "@/lib/listings-data";
import { brandsOf, search } from "@/lib/search";
import { RECENT_LIMIT, type StoreBackend } from "@/lib/store-types";
import { supabase } from "@/lib/supabase";
import type { Listing, SavedListing } from "@/lib/types";

const LISTINGS_CACHE_MS = 60_000;
const PAGE = 1000; // PostgREST returns at most 1000 rows per request by default

/**
 * Runs a Supabase query and turns any failure – PostgREST error, bad key, no
 * network – into StoreUnavailable, which the API reports as a 500 / 503 rather
 * than a bug.
 */
async function run<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T | null> {
  let result: { data: T | null; error: { message: string } | null };
  try {
    result = await query;
  } catch (err) {
    throw new StoreUnavailable(`Supabase request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (result.error) throw new StoreUnavailable(`Supabase: ${result.error.message}`);
  return result.data;
}

/* ---------- Listings (cached) ---------- */

type Cache = { listings: Listing[]; byId: Map<string, Listing>; fetchedAt: number };
let cache: Cache | undefined;
let inflight: Promise<Cache> | undefined;

async function fetchAllListings(): Promise<Cache> {
  const rows: RawListing[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await run<RawListing[]>(
      supabase().from("listings").select("id,title,brand,price,size,marketplace,description").order("id").range(from, from + PAGE - 1),
    );
    rows.push(...(page ?? []));
    if (!page || page.length < PAGE) break;
  }
  const listings = rows.map(toListing);
  return { listings, byId: new Map(listings.map((l) => [l.id, l])), fetchedAt: Date.now() };
}

async function listings(): Promise<Cache> {
  if (cache && Date.now() - cache.fetchedAt < LISTINGS_CACHE_MS) return cache;
  // Concurrent requests share one fetch instead of each hitting the database.
  inflight ??= fetchAllListings().then(
    (c) => (cache = c),
    (err) => {
      if (cache) return cache; // stale is better than down
      throw err;
    },
  );
  try {
    return await inflight;
  } finally {
    inflight = undefined;
  }
}

async function getListing(id: string): Promise<Listing> {
  const listing = (await listings()).byId.get(id);
  if (!listing) throw new HttpError(404, "That listing no longer exists.");
  return listing;
}

/* ---------- Saved / recent rows ---------- */

type SavedRow = { listing_id: string; note: string | null; saved_at: string };
type RecentRow = { listing_id: string };

const forVisitor = (visitorId: string, listingId: string) => ({ visitor_id: visitorId, listing_id: listingId });

export const supabaseStore: StoreBackend = {
  description: `Supabase Postgres at ${process.env.SUPABASE_URL} (saved and recently-viewed rows persist across restarts and redeploys)`,
  kind: "supabase",
  persistent: true,

  async countListings() {
    // A real probe: `head` asks the database for the count without sending rows.
    let result: { count: number | null; error: { message: string } | null };
    try {
      result = await supabase().from("listings").select("id", { count: "exact", head: true });
    } catch (err) {
      throw new StoreUnavailable(`Supabase request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (result.error) throw new StoreUnavailable(`Supabase: ${result.error.message}`);
    return result.count ?? 0;
  },
  async searchListings(p) {
    return search((await listings()).listings, p);
  },
  async listBrands() {
    return brandsOf((await listings()).listings);
  },
  getListing,

  async getSavedListings(visitorId): Promise<SavedListing[]> {
    const { byId } = await listings();
    const rows = await run<SavedRow[]>(
      supabase().from("saved").select("listing_id,note,saved_at").eq("visitor_id", visitorId).order("saved_at", { ascending: false }),
    );
    return (rows ?? []).flatMap((r) => {
      const listing = byId.get(r.listing_id);
      return listing ? [{ ...listing, note: r.note, saved_at: r.saved_at }] : [];
    });
  },

  async saveListing(visitorId, listingId) {
    const listing = await getListing(listingId); // 404s if the id is bogus
    const key = forVisitor(visitorId, listingId);
    // Saving twice is harmless – and keeps an existing note.
    await run(supabase().from("saved").upsert(key, { onConflict: "visitor_id,listing_id", ignoreDuplicates: true }));
    // A saved listing shouldn't also sit in "recently viewed".
    await run(supabase().from("recent").delete().match(key));
    const row = await run<SavedRow>(supabase().from("saved").select("listing_id,note,saved_at").match(key).single());
    return { ...listing, note: row?.note ?? null, saved_at: row?.saved_at ?? new Date().toISOString() };
  },

  async setSavedNote(visitorId, listingId, note) {
    const rows = await run<SavedRow[]>(
      supabase().from("saved").update({ note }).match(forVisitor(visitorId, listingId)).select("listing_id,note,saved_at"),
    );
    if (!rows?.length) throw new HttpError(404, "That listing isn't in your saved list.");
    return { ...(await getListing(listingId)), note, saved_at: rows[0].saved_at };
  },

  async removeSavedListing(visitorId, listingId) {
    await run(supabase().from("saved").delete().match(forVisitor(visitorId, listingId)));
  },

  async getRecentlyViewed(visitorId) {
    const { byId } = await listings();
    const rows = await run<RecentRow[]>(
      supabase()
        .from("recent")
        .select("listing_id")
        .eq("visitor_id", visitorId)
        .order("viewed_at", { ascending: false })
        .limit(RECENT_LIMIT),
    );
    return (rows ?? []).flatMap((r) => byId.get(r.listing_id) ?? []);
  },

  async clearRecentlyViewed(visitorId) {
    await run(supabase().from("recent").delete().eq("visitor_id", visitorId));
  },

  /** Records a view unless the listing is saved, then trims history to RECENT_LIMIT rows. */
  async recordView(visitorId, listingId) {
    await getListing(listingId); // 404s if the id is bogus
    const key = forVisitor(visitorId, listingId);

    const saved = await run<{ listing_id: string }[]>(supabase().from("saved").select("listing_id").match(key).limit(1));
    if (saved?.length) return;

    // Re-opening a listing moves it to the top.
    await run(
      supabase()
        .from("recent")
        .upsert({ ...key, viewed_at: new Date().toISOString() }, { onConflict: "visitor_id,listing_id" }),
    );

    const overflow = await run<RecentRow[]>(
      supabase()
        .from("recent")
        .select("listing_id")
        .eq("visitor_id", visitorId)
        .order("viewed_at", { ascending: false })
        .range(RECENT_LIMIT, RECENT_LIMIT + 99),
    );
    if (overflow?.length) {
      await run(
        supabase()
          .from("recent")
          .delete()
          .eq("visitor_id", visitorId)
          .in(
            "listing_id",
            overflow.map((r) => r.listing_id),
          ),
      );
    }
  },
};
