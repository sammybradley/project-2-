// The search itself, over an array of listings. Both stores use it: the
// in-memory one over the listings it loaded from disk, the Supabase one over
// the listings it fetched from the database. Keeping it here means the synonym
// and partial-match rules are identical whichever store is running.

import { DEFAULT_SORT, type Listing, type SearchParams, type SearchResult } from "@/lib/types";

const SEARCH_LIMIT = 200;

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
export function search(listings: Listing[], p: SearchParams): SearchResult {
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

  const scored = listings
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

/** Every distinct brand, A–Z, for the brand filter's suggestions. */
export function brandsOf(listings: Listing[]): string[] {
  return [...new Set(listings.map((l) => l.brand))].sort((a, b) => a.localeCompare(b));
}
