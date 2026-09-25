// The backend's storage: plain in-memory arrays. No database is involved – the
// practice listings are loaded from data/listings.json when the process starts,
// and saved / recently-viewed rows live only as long as the server runs.
//
// Every function is async and takes/returns the same shapes a database-backed
// version would, so swapping this file for real storage later doesn't touch the
// Route Handlers.

import { HttpError, StoreUnavailable } from "@/lib/errors";
import { loadListings } from "@/lib/listings-data";
import { DEFAULT_SORT, MAX_NOTE_LENGTH, type Listing, type SavedListing, type SearchParams } from "@/lib/types";

export const RECENT_LIMIT = 10;
const SEARCH_LIMIT = 60;

type SavedRow = { visitorId: string; listingId: string; seq: number; note: string | null };
type ViewRow = { visitorId: string; listingId: string; seq: number };

type Db = {
  listings: Listing[];
  byId: Map<string, Listing>;
  saved: SavedRow[];
  recent: ViewRow[];
  /** Monotonic counter: newer rows get bigger numbers (clock ticks can collide). */
  seq: number;
  /** Development switch: when true every query fails, like a database outage. */
  outage: boolean;
};

// Kept on globalThis so `next dev` re-compiling this module doesn't wipe the data.
const g = globalThis as typeof globalThis & { __resaleFinderStore?: Db };

function rawDb(): Db {
  if (!g.__resaleFinderStore) {
    const listings = loadListings();
    g.__resaleFinderStore = {
      listings,
      byId: new Map(listings.map((l) => [l.id, l])),
      saved: [],
      recent: [],
      seq: 0,
      outage: false,
    };
  }
  return g.__resaleFinderStore;
}

function db(): Db {
  const store = rawDb();
  if (store.outage) throw new StoreUnavailable("The store is unavailable (simulated outage).");
  return store;
}

/** Development only (see /api/dev/outage): make every query fail, or recover. */
export function setOutage(on: boolean): boolean {
  rawDb().outage = on;
  return on;
}
export function isOutage(): boolean {
  return rawDb().outage;
}

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();

/* ---------- Listings ---------- */

export async function searchListings(p: SearchParams): Promise<Listing[]> {
  const store = db();

  // Every word of the search term must appear somewhere in the title, brand or
  // description, so "Chrome Hearts hoodie" finds a Chrome Hearts listing titled
  // "Cross Patch Pullover Hoodie". A trailing "s" is dropped ("hoodies",
  // "jackets", "Levis") – with a contains match that can only broaden results.
  const words = p.q
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .filter(Boolean);
  const brand = lower(p.brand);
  const size = lower(p.size);

  const results = store.listings.filter((l) => {
    const fields = [lower(l.title), lower(l.brand), lower(l.description)];
    if (!words.every((w) => fields.some((f) => f.includes(w)))) return false;
    if (brand && !lower(l.brand).includes(brand)) return false;
    if (size && lower(l.size) !== size) return false;
    if (p.maxPrice !== undefined && l.price > p.maxPrice) return false;
    return true;
  });

  const direction = (p.sort ?? DEFAULT_SORT) === "price-asc" ? 1 : -1;
  results.sort((a, b) => (a.price - b.price) * direction || a.id.localeCompare(b.id)); // stable for equal prices
  return results.slice(0, SEARCH_LIMIT);
}

/** Every distinct brand in the practice data, A–Z, for the brand filter's suggestions. */
export async function listBrands(): Promise<string[]> {
  return [...new Set(db().listings.map((l) => l.brand))].sort((a, b) => a.localeCompare(b));
}

/** How many practice listings are loaded – a cheap "is the store working?" probe. */
export async function countListings(): Promise<number> {
  return db().listings.length;
}

export async function getListing(id: string): Promise<Listing> {
  const listing = db().byId.get(id);
  if (!listing) throw new HttpError(404, "That listing no longer exists.");
  return listing;
}

/* ---------- Saved ---------- */

const forVisitor = (visitorId: string, listingId: string) => (r: { visitorId: string; listingId: string }) =>
  r.visitorId === visitorId && r.listingId === listingId;

const newestFirst = (a: { seq: number }, b: { seq: number }) => b.seq - a.seq;

export async function getSavedListings(visitorId: string): Promise<SavedListing[]> {
  const store = db();
  return store.saved
    .filter((r) => r.visitorId === visitorId)
    .sort(newestFirst)
    .map((r) => ({ ...store.byId.get(r.listingId)!, note: r.note }));
}

export async function saveListing(visitorId: string, listingId: string): Promise<SavedListing> {
  const listing = await getListing(listingId); // 404s if the id is bogus
  const store = db();
  // Saving twice is harmless – and keeps an existing note.
  let row = store.saved.find(forVisitor(visitorId, listingId));
  if (!row) {
    row = { visitorId, listingId, seq: ++store.seq, note: null };
    store.saved.push(row);
  }
  // A saved listing shouldn't also sit in "recently viewed".
  store.recent = store.recent.filter((r) => !forVisitor(visitorId, listingId)(r));
  return { ...listing, note: row.note };
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
  const store = db();
  const row = store.saved.find(forVisitor(visitorId, listingId));
  if (!row) throw new HttpError(404, "That listing isn't in your saved list.");
  row.note = note;
  return { ...store.byId.get(listingId)!, note };
}

export async function removeSavedListing(visitorId: string, listingId: string): Promise<void> {
  const store = db();
  store.saved = store.saved.filter((r) => !forVisitor(visitorId, listingId)(r));
}

/* ---------- Recently viewed ---------- */

export async function getRecentlyViewed(visitorId: string): Promise<Listing[]> {
  const store = db();
  return store.recent
    .filter((r) => r.visitorId === visitorId)
    .sort(newestFirst)
    .slice(0, RECENT_LIMIT)
    .map((r) => store.byId.get(r.listingId)!);
}

export async function clearRecentlyViewed(visitorId: string): Promise<void> {
  const store = db();
  store.recent = store.recent.filter((r) => r.visitorId !== visitorId);
}

/** Records a view unless the listing is saved, then trims history to RECENT_LIMIT rows. */
export async function recordView(visitorId: string, listingId: string): Promise<void> {
  const store = db();
  if (!store.byId.has(listingId)) throw new HttpError(404, "That listing no longer exists.");
  if (store.saved.some(forVisitor(visitorId, listingId))) return;

  const existing = store.recent.find(forVisitor(visitorId, listingId));
  if (existing) existing.seq = ++store.seq;
  else store.recent.push({ visitorId, listingId, seq: ++store.seq });

  const overflow = store.recent
    .filter((r) => r.visitorId === visitorId)
    .sort(newestFirst)
    .slice(RECENT_LIMIT);
  if (overflow.length) store.recent = store.recent.filter((r) => !overflow.includes(r));
}
