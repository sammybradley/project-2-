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

/** A saved listing carries the visitor's own note (null until they write one). */
export type SavedListing = Listing & { note: string | null };

export const MAX_NOTE_LENGTH = 300;

export type SearchParams = {
  q: string;
  brand?: string;
  maxPrice?: number;
  size?: string;
  /** Result order; omitted means DEFAULT_SORT. */
  sort?: SortOrder;
};

/** Every API route answers with one of these two envelopes. */
export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string };
export type ApiResponse<T> = ApiOk<T> | ApiErr;
