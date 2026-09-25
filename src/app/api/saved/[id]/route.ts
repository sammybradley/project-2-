import { getVisitorId, handle, ok, readJson } from "@/lib/server/api";
import { normaliseNote, removeSavedListing, setSavedNote } from "@/lib/server/listings";

// PATCH /api/saved/:id { note } – attach (or clear, with null/"") a note to a saved listing.
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await readJson<{ note: string | null }>(req);
  const note = normaliseNote(body.note);
  const visitorId = await getVisitorId();
  return ok(await setSavedNote(visitorId, id, note));
});

// DELETE /api/saved/:id – remove a listing from Saved.
export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const visitorId = await getVisitorId();
  await removeSavedListing(visitorId, id);
  return ok({ removed: id });
});
