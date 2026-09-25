// The backend's storage: plain in-memory arrays. No database is involved – the
// practice listings are loaded from data/listings.json when the process starts,
// and saved / recently-viewed rows live only as long as the server runs.
//
// Every function is async and takes/returns the same shapes a database-backed
// version would, so swapping this file for real storage later doesn't touch the
// Route Handlers.

import { HttpError, StoreUnavailable } from "@/lib/errors";
import { loadListings } from "@/lib/listings-data";
import { DEFAULT_SORT, MAX_NOTE_LENGTH, type Listing, type SavedListing, type SearchParams, type SearchResult } from "@/lib/types";

export const RECENT_LIMIT = 10;
const SEARCH_LIMIT = 200;

type SavedRow = { visitorId: string; listingId: string; seq: number; note: string | null };
type ViewRow = { visitorId: string; listingId: string; seq: number };

type Db = {
  saved: SavedRow[];
  recent: ViewRow[];
  /** Monotonic counter: newer rows get bigger numbers (clock ticks can collide). */
  seq: number;
  /** Development switch: when true every query fails, like a database outage. */
  outage: boolean;
};

// The listings are module-level, so editing data/listings.json (or re-running
// the generator) shows up on the next request in `next dev` – no restart needed.
const LISTINGS: Listing[] = loadListings();
const BY_ID = new Map(LISTINGS.map((l) => [l.id, l]));

// Saved and recently-viewed rows live on globalThis, so `next dev` re-compiling
// this module doesn't wipe what visitors have saved.
const g = globalThis as typeof globalThis & { __resaleFinderStore?: Db };

function rawDb(): Db {
  if (!g.__resaleFinderStore) g.__resaleFinderStore = { saved: [], recent: [], seq: 0, outage: false };
  return g.__resaleFinderStore;
}

type Store = Db & { listings: Listing[]; byId: Map<string, Listing> };

function db(): Store {
  const store = rawDb();
  if (store.outage) throw new StoreUnavailable("The store is unavailable (simulated outage).");
  return Object.assign(store, { listings: LISTINGS, byId: BY_ID });
}

/** Development only (see /api/dev/outage): make every query fail, or recover. */
export function setOutage(on: boolean): boolean {
  rawDb().outage = on;
  return on;
}
export function isOutage(): boolean {
  return rawDb().outage;
}

/* ---------- Listings ---------- */

// Words people type that the listings may phrase differently. A search word
// matches a listing if the word itself or any of its synonyms appears in the
// title, brand or description. Keys and values are singular (see singular()).
const SYNONYMS: Record<string, string[]> = {
  hoodie: ["hoody", "hooded", "sweatshirt", "pullover"],
  hoody: ["hoodie", "hooded"],
  sweatshirt: ["hoodie", "crewneck", "pullover"],
  crewneck: ["sweatshirt"],
  pullover: ["hoodie", "sweatshirt"],
  tee: ["t-shirt", "tshirt"],
  "t-shirt": ["tee", "tshirt"],
  tshirt: ["tee", "t-shirt"],
  shirt: ["tee", "t-shirt"],
  sneaker: ["shoe", "trainer", "runner"],
  shoe: ["sneaker", "boot", "trainer", "clog", "sandal"],
  trainer: ["sneaker", "shoe"],
  kick: ["sneaker", "shoe"],
  footwear: ["sneaker", "shoe", "boot"],
  jean: ["denim"],
  denim: ["jean"],
  jacket: ["coat", "parka", "puffer", "windbreaker", "bomber", "overshirt"],
  coat: ["jacket", "parka", "overcoat"],
  puffer: ["down", "jacket"],
  pant: ["trouser", "sweatpant", "jogger", "chino", "cargo"],
  trouser: ["pant"],
  jogger: ["sweatpant", "track pant"],
  sweatpant: ["jogger"],
  short: ["shorts"],
  cap: ["hat"],
  hat: ["cap", "beanie", "bucket"],
  beanie: ["hat"],
  sweater: ["knit", "jumper", "cardigan"],
  jumper: ["sweater", "knit"],
  knit: ["sweater", "jumper", "cardigan"],
  knitwear: ["sweater", "knit", "cardigan"],
  vintage: ["retro", "90s", "archive"],
  retro: ["vintage", "90s"],
  bag: ["backpack", "tote"],
  gray: ["grey"],
  grey: ["gray"],
  outerwear: ["jacket", "coat", "parka"],
  top: ["tee", "hoodie", "sweatshirt", "shirt", "sweater"],
};

// "hoodies" → "hoodie", "Levis" → "levi". With a contains match dropping the s
// can only broaden results, never lose them. Short words ("s", "xs") are kept.
const singular = (w: string) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();

/** Search words + everything each one may also appear as. */
function expand(q: string): string[][] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .map((w) => [w, ...(SYNONYMS[w] ?? [])]);
}

/**
 * Search. Every word must appear (as itself or a synonym) in the title, brand or
 * description – "Chrome Hearts hoodie" finds a Chrome Hearts listing titled
 * "Cross Patch Pullover Hoodie". If nothing matches every word, the closest
 * listings are returned instead (most matching words first) and the result is
 * marked `match: "partial"` so the UI can say so. Brand, size and price filters
 * always apply.
 */
export async function searchListings(p: SearchParams): Promise<SearchResult> {
  const store = db();
  const words = expand(p.q);
  const brand = lower(p.brand);
  const size = lower(p.size);

  const passesFilters = (l: Listing) =>
    (!brand || lower(l.brand).includes(brand)) &&
    (!size || lower(l.size) === size) &&
    (p.maxPrice === undefined || l.price <= p.maxPrice);

  const matchedWords = (l: Listing) => {
    const fields = [lower(l.title), lower(l.brand), lower(l.description)];
    return words.filter((forms) => forms.some((f) => fields.some((field) => field.includes(f)))).length;
  };

  const scored = store.listings
    .filter(passesFilters)
    .map((listing) => ({ listing, hits: matchedWords(listing) }))
    .filter((s) => s.hits > 0);

  const direction = (p.sort ?? DEFAULT_SORT) === "price-asc" ? 1 : -1;
  const byPrice = (a: Listing, b: Listing) => (a.price - b.price) * direction || a.id.localeCompare(b.id); // stable for equal prices

  const exact = scored.filter((s) => s.hits === words.length).map((s) => s.listing);
  if (exact.length || words.length < 2) {
    return { listings: exact.sort(byPrice).slice(0, SEARCH_LIMIT), match: "all" };
  }
  const closest = scored
    .sort((a, b) => b.hits - a.hits || byPrice(a.listing, b.listing))
    .slice(0, SEARCH_LIMIT)
    .map((s) => s.listing);
  return { listings: closest, match: "partial" };
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
