// `npm run check:db` – confirms the real Supabase project is set up the way the
// app expects: .env.local filled in, the three tables from supabase/schema.sql
// present, and the practice listings from supabase/seed.sql loaded.
// Run it after the SQL editor steps in the README, and again before deploying.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadListingRows, projectRoot } from "./lib/listing-rows.mjs";

const envPath = join(projectRoot, ".env.local");
if (existsSync(envPath)) {
  // Next.js loads .env.local itself; this script has to do it by hand.
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

let failed = 0;
const pass = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg, hint) => {
  failed++;
  console.log(`  ✗ ${msg}`);
  if (hint) console.log(`      → ${hint}`);
};

console.log("Resale Finder – Supabase check\n");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || url.includes("your-project-ref") || key === "your-service-role-key") {
  fail(
    ".env.local is missing or still has the placeholder values",
    "cp .env.local.example .env.local, then paste the Project URL and service_role key from Supabase → Project Settings → API",
  );
  process.exit(1);
}
pass(`SUPABASE_URL is set (${url})`);
pass("SUPABASE_SERVICE_ROLE_KEY is set");
if (key.startsWith("eyJ")) {
  try {
    const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    if (claims.role === "service_role") pass("the key is a service_role key");
    else fail(`the key's role is "${claims.role}", not service_role`, "the anon key can't read the tables (RLS is on with no policies)");
  } catch {
    /* not a JWT – newer secret keys aren't; fine */
  }
}

const db = createClient(url, key, { auth: { persistSession: false } });

async function count(table) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

for (const table of ["listings", "saved_listings", "recently_viewed"]) {
  try {
    const n = await count(table);
    pass(`table "${table}" exists (${n} row${n === 1 ? "" : "s"})`);
    if (table === "listings") {
      const expected = loadListingRows().length;
      if (n === 0) fail("listings is empty", "run supabase/seed.sql in the SQL editor");
      else if (n !== expected) fail(`listings has ${n} rows but data/listings.json has ${expected}`, "re-run supabase/seed.sql (it upserts)");
      else pass(`all ${expected} practice listings are loaded`);
    }
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (/schema cache|does not exist|Could not find/i.test(msg)) fail(`table "${table}" is missing`, "run supabase/schema.sql in the SQL editor");
    else if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(msg)) fail(`could not reach ${url}`, "check SUPABASE_URL and your connection");
    else if (/Invalid API key|JWT|401|403/i.test(msg)) fail(`Supabase rejected the key (${msg})`, "copy the service_role key again from Project Settings → API");
    else fail(`"${table}": ${msg}`);
  }
}

// The note column was added after the first schema – make sure it's there.
try {
  const { error } = await db.from("saved_listings").select("note", { head: true, count: "exact" });
  if (error) throw error;
  pass('saved_listings has the "note" column');
} catch (err) {
  const msg = err?.message ?? String(err);
  if (/column|schema cache/i.test(msg)) fail('saved_listings is missing the "note" column', "re-run supabase/schema.sql (it adds the column without dropping anything)");
  else fail(`note column check: ${msg}`);
}

// One real search, the way /api/search does it.
try {
  const { data, error } = await db
    .from("listings")
    .select("id, brand, title")
    .or("title.ilike.%hoodie%,brand.ilike.%hoodie%,description.ilike.%hoodie%")
    .ilike("brand", "%Chrome Hearts%")
    .lte("price", 300)
    .limit(5);
  if (error) throw error;
  if (data.length) pass(`search works: "Chrome Hearts hoodie under $300" → ${data.map((r) => r.id).join(", ")}`);
  else fail("search returned nothing for Chrome Hearts hoodies under $300", "was the seed loaded?");
} catch (err) {
  fail(`search query failed: ${err?.message ?? err}`);
}

console.log(failed ? `\n${failed} problem${failed === 1 ? "" : "s"} found.` : "\nAll good – npm run dev will use this project.");
process.exit(failed ? 1 : 0);
