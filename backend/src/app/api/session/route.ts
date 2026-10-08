import { getVisitorId, handle, ok } from "@/lib/api";
import { countListings, getRecentlyViewed, getSavedListings, storageDescription, storeKind, storePersistent } from "@/lib/store";

// GET /api/session – what the database holds for *this* browser right now.
//
// There are no accounts: the anonymous rf_visitor cookie is the key every saved
// and recently-viewed row is stored under. The frontend shows this so it's
// clear the counts come from the database (keyed by that cookie) and not from
// anything kept in the page or the browser. Only the first 8 characters of
// the id are returned – enough to recognise, not enough to spoof.
export const GET = handle(async () => {
  const visitorId = await getVisitorId();
  const [saved, recent, listings] = await Promise.all([
    getSavedListings(visitorId),
    getRecentlyViewed(visitorId),
    countListings(),
  ]);
  return ok({
    visitor: visitorId.slice(0, 8),
    savedCount: saved.length,
    recentCount: recent.length,
    store: { kind: storeKind, persistent: storePersistent, description: storageDescription, listings },
  });
});
