// Shapes the API answers with. The frontend has an identical copy in its own
// src/lib/types.ts – the two apps share nothing but the JSON on the wire.

export type Listing = {
  id: string;
  title: string;
  brand: string;
  price: number;
  size: string | null;
  /** Path to the listing's image, served by the frontend (e.g. /images/ch-001.svg). */
  image_url: string;
  marketplace: string;
  /** The original listing on the marketplace. */
  listing_url: string;
  description: string | null;
};

export const SORTS = ["price-asc", "price-desc"] as const;
export type SortOrder = (typeof SORTS)[number];
export const DEFAULT_SORT: SortOrder = "price-asc";

/**
 * A saved listing carries the visitor's own note (null until they write one)
 * and when it was saved (ISO 8601, set by the store when the row is written).
 */
export type SavedListing = Listing & { note: string | null; saved_at: string };

export const MAX_NOTE_LENGTH = 300;

export type SearchParams = {
  q: string;
  brand?: string;
  maxPrice?: number;
  size?: string;
  /** Result order; omitted means DEFAULT_SORT. */
  sort?: SortOrder;
};

/** What /api/search answers: the listings, and whether every word matched or only some. */
export type SearchResult = {
  listings: Listing[];
  /** "all": every search word matched each listing. "partial": nothing matched every word, so these are the closest listings (most matching words first). */
  match: "all" | "partial";
};

/** Every API route answers with one of these two envelopes. */
export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string };
export type ApiResponse<T> = ApiOk<T> | ApiErr;
