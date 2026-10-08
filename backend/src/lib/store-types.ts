// What a store has to provide. store.ts picks one implementation (in-memory or
// Supabase) at startup and the Route Handlers only ever talk to store.ts.

import type { Listing, SavedListing, SearchParams, SearchResult } from "@/lib/types";

export const RECENT_LIMIT = 10;

export type StoreBackend = {
  /** Shown by GET / and GET /api so you can tell which store is running. */
  description: string;
  /** Which implementation this is. */
  kind: "supabase" | "memory";
  /** True when saved / recently-viewed rows survive a server restart or redeploy. */
  persistent: boolean;

  countListings(): Promise<number>;
  searchListings(p: SearchParams): Promise<SearchResult>;
  listBrands(): Promise<string[]>;
  /** 404s when the id is unknown. */
  getListing(id: string): Promise<Listing>;

  getSavedListings(visitorId: string): Promise<SavedListing[]>;
  saveListing(visitorId: string, listingId: string): Promise<SavedListing>;
  setSavedNote(visitorId: string, listingId: string, note: string | null): Promise<SavedListing>;
  removeSavedListing(visitorId: string, listingId: string): Promise<void>;

  getRecentlyViewed(visitorId: string): Promise<Listing[]>;
  clearRecentlyViewed(visitorId: string): Promise<void>;
  recordView(visitorId: string, listingId: string): Promise<void>;
};
