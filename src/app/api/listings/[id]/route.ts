import { handle, ok } from "@/lib/server/api";
import { getListing } from "@/lib/server/listings";

// GET /api/listings/:id
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return ok(await getListing(id));
});
