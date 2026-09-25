import { getVisitorId, handle, HttpError, ok, readJson } from "@/lib/server/api";
import { clearRecentlyViewed, getRecentlyViewed, recordView } from "@/lib/server/listings";

// GET /api/recent – the 10 most recently viewed (unsaved) listings.
export const GET = handle(async () => {
  const visitorId = await getVisitorId();
  return ok(await getRecentlyViewed(visitorId));
});

// POST /api/recent { listingId } – record that the visitor opened a listing.
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ listingId: string }>(req);
  if (typeof body.listingId !== "string" || !body.listingId.trim()) {
    throw new HttpError(400, "listingId is required.");
  }
  const visitorId = await getVisitorId();
  await recordView(visitorId, body.listingId);
  return ok({ recorded: body.listingId });
});

// DELETE /api/recent – clear this visitor's recently viewed history.
export const DELETE = handle(async () => {
  const visitorId = await getVisitorId();
  await clearRecentlyViewed(visitorId);
  return ok({ cleared: true });
});
