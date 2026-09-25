import { fail, handle, ok } from "@/lib/api";
import { StoreUnavailable } from "@/lib/errors";
import { countListings } from "@/lib/store";

// GET /api/health – is the backend up and is the store answering?
// 200 with the listing count when it is, 503 (with the reason) when it isn't.
export const GET = handle(async () => {
  try {
    const listings = await countListings();
    if (listings === 0) return fail(503, "The store is reachable but has no listings loaded.");
    return ok({ store: "ok", listings });
  } catch (err) {
    if (err instanceof StoreUnavailable) return fail(503, `Store unavailable: ${err.message}`);
    throw err;
  }
});
