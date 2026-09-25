import { handle, ok, fail } from "@/lib/server/api";
import { searchListings } from "@/lib/server/listings";
import { validateSearch } from "@/lib/validate";

// GET /api/search?q=...&brand=...&size=...&maxPrice=...
export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const result = validateSearch({
    q: sp.get("q"),
    brand: sp.get("brand"),
    size: sp.get("size"),
    maxPrice: sp.get("maxPrice"),
    sort: sp.get("sort"),
  });
  if (!result.ok) return fail(400, Object.values(result.errors).join(" "));
  return ok(await searchListings(result.params));
});
