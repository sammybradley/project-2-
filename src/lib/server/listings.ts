import "server-only";
import { getSupabase } from "@/lib/server/supabase";
import { HttpError } from "@/lib/server/api";
import { DEFAULT_SORT, MAX_NOTE_LENGTH, type Listing, type SavedListing, type SearchParams } from "@/lib/types";

const LISTING_COLUMNS =
  "id, title, brand, price, size, image_url, marketplace, listing_url, description";

export const RECENT_LIMIT = 10;
const SEARCH_LIMIT = 60;

// Supabase numeric columns come back as strings; normalise once here.
function toListing(row: Record<string, unknown>): Listing {
  return { ...(row as Listing), price: Number(row.price) };
}

// PostgREST filter values can't contain these without breaking the expression.
const escapeLike = (s: string) => s.replace(/[%_\\,()]/g, " ").trim();

export async function searchListings(p: SearchParams): Promise<Listing[]> {
  let query = getSupabase().from("listings").select(LISTING_COLUMNS);

  // Every word of the search term must appear somewhere in the title, brand or
  // description, so "Chrome Hearts hoodie" finds a Chrome Hearts listing titled
  // "Cross Patch Pullover Hoodie". Chained .or() calls AND together.
  // A trailing "s" is dropped ("hoodies", "jackets", "Levis") – with a contains
  // match that can only broaden results, never lose them.
  const words = p.q
    .split(/\s+/)
    .map(escapeLike)
    .map((w) => (w.length > 3 && /s$/i.test(w) ? w.slice(0, -1) : w))
    .filter(Boolean);
  for (const word of words) {
    const like = `%${word}%`;
    query = query.or(`title.ilike.${like},brand.ilike.${like},description.ilike.${like}`);
  }
  if (p.brand) query = query.ilike("brand", `%${escapeLike(p.brand)}%`);
  if (p.size) query = query.ilike("size", escapeLike(p.size));
  if (p.maxPrice !== undefined) query = query.lte("price", p.maxPrice);

  const sort = p.sort ?? DEFAULT_SORT;
  const { data, error } = await query
    .order("price", { ascending: sort === "price-asc" })
    .order("id", { ascending: true }) // stable order for equal prices
    .limit(SEARCH_LIMIT);
  if (error) throw new Error(`Search failed: ${error.message}`);
  return data.map(toListing);
}

/** Every distinct brand in the practice data, A–Z, for the brand filter's suggestions. */
export async function listBrands(): Promise<string[]> {
  const { data, error } = await getSupabase().from("listings").select("brand").order("brand", { ascending: true });
  if (error) throw new Error(`Could not load brands: ${error.message}`);
  return [...new Set(data.map((r) => r.brand as string))];
}

/** How many practice listings are loaded – a cheap "is the database reachable?" probe. */
export async function countListings(): Promise<number> {
  const { count, error } = await getSupabase().from("listings").select("id", { count: "exact", head: true });
  if (error) throw new Error(`Could not reach the listings table: ${error.message}`);
  return count ?? 0;
}

export async function getListing(id: string): Promise<Listing> {
  const { data, error } = await getSupabase()
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load listing: ${error.message}`);
  if (!data) throw new HttpError(404, "That listing no longer exists.");
  return toListing(data);
}

/* ---------- Saved ---------- */

type SavedRow = { note: string | null; listing: Record<string, unknown> | null };

const toSaved = (rows: SavedRow[]): SavedListing[] =>
  rows
    .filter((r): r is SavedRow & { listing: Record<string, unknown> } => r.listing !== null)
    .map((r) => ({ ...toListing(r.listing), note: r.note ?? null }));

export async function getSavedListings(visitorId: string): Promise<SavedListing[]> {
  const { data, error } = await getSupabase()
    .from("saved_listings")
    .select(`saved_at, note, listing:listings (${LISTING_COLUMNS})`)
    .eq("visitor_id", visitorId)
    .order("saved_at", { ascending: false });
  if (error) throw new Error(`Could not load saved listings: ${error.message}`);
  return toSaved(data as unknown as SavedRow[]);
}

export async function saveListing(visitorId: string, listingId: string): Promise<SavedListing> {
  const listing = await getListing(listingId); // 404s if the id is bogus
  const db = getSupabase();
  // Upsert so saving twice is harmless – and so an existing note is kept.
  const { data, error } = await db
    .from("saved_listings")
    .upsert({ visitor_id: visitorId, listing_id: listingId }, { onConflict: "visitor_id,listing_id" })
    .select("note");
  if (error) throw new Error(`Could not save listing: ${error.message}`);
  // A saved listing shouldn't also sit in "recently viewed".
  await db.from("recently_viewed").delete().match({ visitor_id: visitorId, listing_id: listingId });
  return { ...listing, note: data?.[0]?.note ?? null };
}

/** Validates a note the way the API expects it: trimmed, capped, blank means "no note". */
export function normaliseNote(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") throw new HttpError(400, "note must be text.");
  const note = raw.trim();
  if (note.length > MAX_NOTE_LENGTH) throw new HttpError(400, `Keep the note under ${MAX_NOTE_LENGTH} characters.`);
  return note || null;
}

export async function setSavedNote(visitorId: string, listingId: string, note: string | null): Promise<SavedListing> {
  const { data, error } = await getSupabase()
    .from("saved_listings")
    .update({ note })
    .match({ visitor_id: visitorId, listing_id: listingId })
    .select(`note, listing:listings (${LISTING_COLUMNS})`);
  if (error) throw new Error(`Could not save note: ${error.message}`);
  const [saved] = toSaved((data ?? []) as unknown as SavedRow[]);
  if (!saved) throw new HttpError(404, "That listing isn't in your saved list.");
  return saved;
}

export async function removeSavedListing(visitorId: string, listingId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("saved_listings")
    .delete()
    .match({ visitor_id: visitorId, listing_id: listingId });
  if (error) throw new Error(`Could not remove listing: ${error.message}`);
}

/* ---------- Recently viewed ---------- */

export async function getRecentlyViewed(visitorId: string): Promise<Listing[]> {
  const { data, error } = await getSupabase()
    .from("recently_viewed")
    .select(`viewed_at, listing:listings (${LISTING_COLUMNS})`)
    .eq("visitor_id", visitorId)
    .order("viewed_at", { ascending: false })
    .limit(RECENT_LIMIT);
  if (error) throw new Error(`Could not load recently viewed: ${error.message}`);
  return data
    .map((r) => r.listing as unknown as Record<string, unknown> | null)
    .filter((l): l is Record<string, unknown> => l !== null)
    .map(toListing);
}

export async function clearRecentlyViewed(visitorId: string): Promise<void> {
  const { error } = await getSupabase().from("recently_viewed").delete().eq("visitor_id", visitorId);
  if (error) throw new Error(`Could not clear recently viewed: ${error.message}`);
}

/** Records a view unless the listing is saved, then trims history to RECENT_LIMIT rows. */
export async function recordView(visitorId: string, listingId: string): Promise<void> {
  const db = getSupabase();
  const { data: saved } = await db
    .from("saved_listings")
    .select("listing_id")
    .match({ visitor_id: visitorId, listing_id: listingId })
    .maybeSingle();
  if (saved) return;

  const { error } = await db
    .from("recently_viewed")
    .upsert(
      { visitor_id: visitorId, listing_id: listingId, viewed_at: new Date().toISOString() },
      { onConflict: "visitor_id,listing_id" },
    );
  if (error) {
    // A foreign-key failure means the listing id is bogus.
    if (error.code === "23503") throw new HttpError(404, "That listing no longer exists.");
    throw new Error(`Could not record view: ${error.message}`);
  }

  const { data: overflow } = await db
    .from("recently_viewed")
    .select("listing_id")
    .eq("visitor_id", visitorId)
    .order("viewed_at", { ascending: false })
    .range(RECENT_LIMIT, RECENT_LIMIT + 50);
  if (overflow?.length) {
    await db
      .from("recently_viewed")
      .delete()
      .eq("visitor_id", visitorId)
      .in("listing_id", overflow.map((r) => r.listing_id));
  }
}
