import { handle, ok } from "@/lib/server/api";
import { listBrands } from "@/lib/server/listings";

// GET /api/brands – every brand in the practice data, for the brand filter's suggestions.
export const GET = handle(async () => ok(await listBrands()));
