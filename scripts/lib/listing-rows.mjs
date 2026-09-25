// The practice listings as database rows: data/listings.json plus the two
// derived columns (image_url, listing_url). Used by generate-seed.mjs (to write
// supabase/seed.sql) and by mock-supabase.mjs (to serve the same rows locally),
// so both always agree.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Where "View original listing" points. These are plain links to the marketplace's
// public search page for the item – the app never calls these sites.
export const marketplaceSearch = {
  Grailed: (q) => `https://www.grailed.com/shop?query=${q}`,
  Depop: (q) => `https://www.depop.com/search/?q=${q}`,
  eBay: (q) => `https://www.ebay.com/sch/i.html?_nkw=${q}`,
  Poshmark: (q) => `https://poshmark.com/search?query=${q}`,
  Vinted: (q) => `https://www.vinted.com/catalog?search_text=${q}`,
  Mercari: (q) => `https://www.mercari.com/search/?keyword=${q}`,
};

export function loadListings() {
  return JSON.parse(readFileSync(join(projectRoot, "data/listings.json"), "utf8"));
}

/** Every listing as the row the `listings` table holds. */
export function loadListingRows() {
  return loadListings().map((l) => {
    const q = encodeURIComponent(`${l.brand} ${l.title}`);
    const toUrl = marketplaceSearch[l.marketplace];
    if (!toUrl) throw new Error(`Unknown marketplace "${l.marketplace}" on listing ${l.id}`);
    return {
      id: l.id,
      title: l.title,
      brand: l.brand,
      price: l.price,
      size: l.size ?? null,
      image_url: `/images/${l.id}.svg`,
      marketplace: l.marketplace,
      listing_url: toUrl(q),
      description: l.description ?? null,
    };
  });
}
