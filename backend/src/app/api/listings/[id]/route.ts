import { handle, ok } from "@/lib/api";
import { getListing } from "@/lib/store";

// GET /api/listings/:id – one listing, 404 if the id is unknown.
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return ok(await getListing(id));
});
