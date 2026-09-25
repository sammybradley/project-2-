import { getVisitorId, handle, ok, readJson } from "@/lib/api";
import { normaliseNote, removeSavedListing, setSavedNote } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/saved/:id { note } – attach (or clear, with null/"") a note to a saved listing.
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readJson<{ note: string | null }>(req);
  const note = normaliseNote(body.note);
  const visitorId = await getVisitorId();
  return ok(await setSavedNote(visitorId, id, note));
});

// DELETE /api/saved/:id – remove a listing from Saved.
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const visitorId = await getVisitorId();
  await removeSavedListing(visitorId, id);
  return ok({ removed: id });
});
