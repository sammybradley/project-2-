import { handle, ok } from "@/lib/api";
import { listBrands } from "@/lib/store";

// GET /api/brands – every brand in the practice data, A–Z.
export const GET = handle(async () => ok(await listBrands()));
