// Loads data/listings.json into the Supabase `listings` table (upsert, so it's
// safe to run again after regenerating the data).
//
//   npm run seed:supabase        (reads SUPABASE_URL / SUPABASE_SECRET_KEY from .env.local)
//
// Run supabase/schema.sql in the Supabase SQL Editor first, or the table won't exist.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL?.trim();
const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in backend/.env.local first (see .env.local.example).");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const listings = JSON.parse(readFileSync(join(root, "data/listings.json"), "utf8")).map((l) => ({
  id: l.id,
  title: l.title,
  brand: l.brand,
  price: l.price,
  size: l.size ?? null,
  marketplace: l.marketplace,
  description: l.description ?? null,
}));

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const CHUNK = 200;
for (let i = 0; i < listings.length; i += CHUNK) {
  const chunk = listings.slice(i, i + CHUNK);
  const { error } = await supabase.from("listings").upsert(chunk, { onConflict: "id" });
  if (error) {
    console.error(`Failed while writing listings ${i + 1}–${i + chunk.length}: ${error.message}`);
    if (/relation .* does not exist/i.test(error.message)) console.error("Did you run supabase/schema.sql in the SQL Editor?");
    process.exit(1);
  }
  console.log(`Wrote ${i + chunk.length} / ${listings.length}`);
}

const { count, error } = await supabase.from("listings").select("id", { count: "exact", head: true });
if (error) {
  console.error(`Written, but couldn't count the table afterwards: ${error.message}`);
  process.exit(1);
}
console.log(`Done – the listings table now has ${count} rows.`);
