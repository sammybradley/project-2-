// Relative, with the extension, so plain Node can run this file in the unit tests.
import { SORTS, type SearchParams, type SortOrder } from "./types.ts";

export type RawSearchInput = {
  q?: string | null;
  brand?: string | null;
  maxPrice?: string | null;
  size?: string | null;
  sort?: string | null;
};

export type ValidationResult =
  | { ok: true; params: SearchParams }
  | { ok: false; errors: Partial<Record<keyof RawSearchInput, string>> };

export const MAX_TERM_LENGTH = 100;

/**
 * Shared by the search form (instant feedback) and the /api/search Route Handler
 * (the real gatekeeper). Blank search terms and negative/invalid prices are rejected.
 */
export function validateSearch(raw: RawSearchInput): ValidationResult {
  const errors: Partial<Record<keyof RawSearchInput, string>> = {};

  const q = (raw.q ?? "").trim();
  if (!q) errors.q = "Enter something to search for.";
  else if (q.length > MAX_TERM_LENGTH) errors.q = `Keep the search under ${MAX_TERM_LENGTH} characters.`;

  const brand = (raw.brand ?? "").trim();
  if (brand.length > MAX_TERM_LENGTH) errors.brand = `Keep the brand under ${MAX_TERM_LENGTH} characters.`;

  const size = (raw.size ?? "").trim();

  let maxPrice: number | undefined;
  const priceText = (raw.maxPrice ?? "").trim().replace(/^\$/, "");
  if (priceText) {
    const n = Number(priceText);
    if (!/^-?\d+(\.\d{1,2})?$/.test(priceText) || !Number.isFinite(n)) {
      errors.maxPrice = "Maximum price must be a number like 300 or 49.99.";
    } else if (n < 0) {
      errors.maxPrice = "Maximum price can't be negative.";
    } else if (n > 1_000_000) {
      errors.maxPrice = "Maximum price is too large.";
    } else {
      maxPrice = n;
    }
  }

  const sortText = (raw.sort ?? "").trim();
  let sort: SortOrder | undefined;
  if (sortText) {
    if ((SORTS as readonly string[]).includes(sortText)) sort = sortText as SortOrder;
    else errors.sort = `Sort must be one of: ${SORTS.join(", ")}.`;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    params: {
      q,
      ...(brand ? { brand } : {}),
      ...(size ? { size } : {}),
      ...(maxPrice !== undefined ? { maxPrice } : {}),
      ...(sort ? { sort } : {}),
    },
  };
}

/** Builds the query string the client sends to /api/search. */
export function toSearchQuery(p: SearchParams): string {
  const sp = new URLSearchParams({ q: p.q });
  if (p.brand) sp.set("brand", p.brand);
  if (p.size) sp.set("size", p.size);
  if (p.maxPrice !== undefined) sp.set("maxPrice", String(p.maxPrice));
  if (p.sort) sp.set("sort", p.sort);
  return sp.toString();
}
