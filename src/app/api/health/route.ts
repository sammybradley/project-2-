import { fail, ok } from "@/lib/server/api";
import { ConfigError } from "@/lib/server/supabase";
import { countListings } from "@/lib/server/listings";

// GET /api/health – is the backend up and can it reach the database?
// Handy right after deploying: 200 means env vars + tables + seed are all in place.
export async function GET() {
  try {
    const listings = await countListings();
    if (listings === 0) return fail(503, "Database reachable but the listings table is empty – run supabase/seed.sql.");
    return ok({ database: "ok", listings });
  } catch (err) {
    if (err instanceof ConfigError) return fail(503, err.message);
    console.error(err);
    return fail(503, "Database unreachable. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
}
