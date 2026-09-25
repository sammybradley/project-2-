import { getVisitorId, handle, HttpError, ok, readJson } from "@/lib/api";
import { getSavedListings, saveListing } from "@/lib/store";

// GET /api/saved – this visitor's saved listings, newest first.
export const GET = handle(async () => {
  const visitorId = await getVisitorId();
  return ok(await getSavedListings(visitorId));
});

// POST /api/saved { listingId } – save a listing. 201 on success.
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ listingId: string }>(req);
  if (typeof body.listingId !== "string" || !body.listingId.trim()) {
    throw new HttpError(400, "listingId is required.");
  }
  const visitorId = await getVisitorId();
  return ok(await saveListing(visitorId, body.listingId), { status: 201 });
});
