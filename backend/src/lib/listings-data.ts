// The practice listings (fictional, no real sellers) as the API serves them:
// data/listings.json plus two derived fields, image_url and listing_url.

import raw from "../../data/listings.json";
import type { Listing } from "@/lib/types";

/** A listing as stored – in data/listings.json and in the Supabase `listings` table. */
export type RawListing = {
  id: string;
  title: string;
  brand: string;
  price: number;
  size?: string | null;
  marketplace: string;
  description?: string | null;
};

// Where "View original listing" points. These are plain links to the marketplace's
// public search page for the item – the backend never calls these sites.
const marketplaceSearch: Record<string, (q: string) => string> = {
  Grailed: (q) => `https://www.grailed.com/shop?query=${q}`,
  Depop: (q) => `https://www.depop.com/search/?q=${q}`,
  eBay: (q) => `https://www.ebay.com/sch/i.html?_nkw=${q}`,
  Poshmark: (q) => `https://poshmark.com/search?query=${q}`,
  Vinted: (q) => `https://www.vinted.com/catalog?search_text=${q}`,
  Mercari: (q) => `https://www.mercari.com/search/?keyword=${q}`,
};

/** A stored listing plus the two derived fields the API serves. */
export function toListing(l: RawListing): Listing {
  const toUrl = marketplaceSearch[l.marketplace];
  if (!toUrl) throw new Error(`Unknown marketplace "${l.marketplace}" on listing ${l.id}`);
  return {
    id: l.id,
    title: l.title,
    brand: l.brand,
    price: Number(l.price),
    size: l.size ?? null,
    image_url: `/images/${l.id}.svg`,
    marketplace: l.marketplace,
    listing_url: toUrl(encodeURIComponent(`${l.brand} ${l.title}`)),
    description: l.description ?? null,
  };
}

export function loadListings(): Listing[] {
  return (raw as RawListing[]).map(toListing);
}
