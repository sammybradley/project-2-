// The in-memory store: plain arrays, no database. The practice listings are
// loaded from data/listings.json when the process starts, and saved /
// recently-viewed rows live only as long as the server runs. This is what runs
// when Supabase isn't configured (see store.ts).

import { HttpError } from "@/lib/errors";
import { loadListings } from "@/lib/listings-data";
import { brandsOf, search } from "@/lib/search";
import { RECENT_LIMIT, type StoreBackend } from "@/lib/store-types";
import type { Listing, SavedListing } from "@/lib/types";

type SavedRow = { visitorId: string; listingId: string; seq: number; note: string | null; savedAt: string };
type ViewRow = { visitorId: string; listingId: string; seq: number };

type Db = {
  saved: SavedRow[];
  recent: ViewRow[];
  /** Monotonic counter: newer rows get bigger numbers (clock ticks can collide). */
  seq: number;
};

// The listings are module-level, so editing data/listings.json (or re-running
// the generator) shows up on the next request in `next dev` – no restart needed.
const LISTINGS: Listing[] = loadListings();
const BY_ID = new Map(LISTINGS.map((l) => [l.id, l]));

// Saved and recently-viewed rows live on globalThis, so `next dev` re-compiling
// this module doesn't wipe what visitors have saved.
const g = globalThis as typeof globalThis & { __resaleFinderStore?: Db };

function db(): Db {
  if (!g.__resaleFinderStore) g.__resaleFinderStore = { saved: [], recent: [], seq: 0 };
  return g.__resaleFinderStore;
}

const forVisitor = (visitorId: string, listingId: string) => (r: { visitorId: string; listingId: string }) =>
  r.visitorId === visitorId && r.listingId === listingId;

const newestFirst = (a: { seq: number }, b: { seq: number }) => b.seq - a.seq;

function getListing(id: string): Listing {
  const listing = BY_ID.get(id);
  if (!listing) throw new HttpError(404, "That listing no longer exists.");
  return listing;
}

export const memoryStore: StoreBackend = {
  description:
    "in-memory (practice listings loaded from data/listings.json; saved and recently-viewed reset when the server restarts)",
  kind: "memory",
  persistent: false,

  async countListings() {
    return LISTINGS.length;
  },
  async searchListings(p) {
    return search(LISTINGS, p);
  },
  async listBrands() {
    return brandsOf(LISTINGS);
  },
  async getListing(id) {
    return getListing(id);
  },

  async getSavedListings(visitorId): Promise<SavedListing[]> {
    return db()
      .saved.filter((r) => r.visitorId === visitorId)
      .sort(newestFirst)
      .map((r) => ({ ...BY_ID.get(r.listingId)!, note: r.note, saved_at: r.savedAt }));
  },

  async saveListing(visitorId, listingId) {
    const listing = getListing(listingId); // 404s if the id is bogus
    const store = db();
    // Saving twice is harmless – and keeps an existing note.
    let row = store.saved.find(forVisitor(visitorId, listingId));
    if (!row) {
      row = { visitorId, listingId, seq: ++store.seq, note: null, savedAt: new Date().toISOString() };
      store.saved.push(row);
    }
    // A saved listing shouldn't also sit in "recently viewed".
    store.recent = store.recent.filter((r) => !forVisitor(visitorId, listingId)(r));
    return { ...listing, note: row.note, saved_at: row.savedAt };
  },

  async setSavedNote(visitorId, listingId, note) {
    const row = db().saved.find(forVisitor(visitorId, listingId));
    if (!row) throw new HttpError(404, "That listing isn't in your saved list.");
    row.note = note;
    return { ...BY_ID.get(listingId)!, note, saved_at: row.savedAt };
  },

  async removeSavedListing(visitorId, listingId) {
    const store = db();
    store.saved = store.saved.filter((r) => !forVisitor(visitorId, listingId)(r));
  },

  async getRecentlyViewed(visitorId) {
    return db()
      .recent.filter((r) => r.visitorId === visitorId)
      .sort(newestFirst)
      .slice(0, RECENT_LIMIT)
      .map((r) => BY_ID.get(r.listingId)!);
  },

  async clearRecentlyViewed(visitorId) {
    const store = db();
    store.recent = store.recent.filter((r) => r.visitorId !== visitorId);
  },

  /** Records a view unless the listing is saved, then trims history to RECENT_LIMIT rows. */
  async recordView(visitorId, listingId) {
    getListing(listingId); // 404s if the id is bogus
    const store = db();
    if (store.saved.some(forVisitor(visitorId, listingId))) return;

    const existing = store.recent.find(forVisitor(visitorId, listingId));
    if (existing) existing.seq = ++store.seq;
    else store.recent.push({ visitorId, listingId, seq: ++store.seq });

    const overflow = store.recent
      .filter((r) => r.visitorId === visitorId)
      .sort(newestFirst)
      .slice(RECENT_LIMIT);
    if (overflow.length) store.recent = store.recent.filter((r) => !overflow.includes(r));
  },
};
