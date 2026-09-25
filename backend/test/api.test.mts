// Automated tests for the backend, over real HTTP – exactly what curl would see.
//
//   npm run dev     (in one terminal – the backend on http://localhost:4000)
//   npm test        (in another)
//
// If nothing is listening on port 4000 the tests start their own `next dev` on a
// spare port and stop it afterwards, so `npm test` also works on its own.
// Point BACKEND_URL at a different server to test that instead.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiResponse, Listing, SavedListing } from "../src/lib/types.ts";
import { MAX_NOTE_LENGTH } from "../src/lib/types.ts";

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
// The practice data the server loads, read independently so the tests can say what to expect.
const listings = JSON.parse(readFileSync(join(backendRoot, "data/listings.json"), "utf8")) as Listing[];

let app = process.env.BACKEND_URL ?? "http://localhost:4000";
let child: ChildProcess | undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

/** True once /api/health answers with our JSON envelope (200 or 503 – either means the server is up). */
async function isUp(base: string): Promise<boolean> {
  try {
    const r = await fetch(`${base}/api/health`);
    if (!r.headers.get("content-type")?.includes("json")) return false;
    const body = (await r.json()) as { ok?: boolean };
    return typeof body.ok === "boolean";
  } catch {
    return false;
  }
}

before(async () => {
  if (await isUp(app)) {
    console.log(`Testing the backend already running at ${app}`);
    return;
  }
  if (process.env.BACKEND_URL) {
    throw new Error(`Nothing is answering at ${app}. Start the backend first (npm run dev) or unset BACKEND_URL.`);
  }

  const port = await freePort();
  app = `http://127.0.0.1:${port}`;
  console.log(`Nothing on port 4000 – starting a temporary backend at ${app}`);
  child = spawn("npx", ["next", "dev", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: backendRoot,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout?.on("data", (d) => (log += d));
  child.stderr?.on("data", (d) => (log += d));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isUp(app)) return;
    if (child.exitCode !== null) break;
    await sleep(300);
  }
  throw new Error(`The backend did not come up:\n${log}`);
});

after(() => {
  child?.kill("SIGTERM");
});

/* ---------- a tiny client that keeps the visitor cookie, like a browser ---------- */

type Reply<T> = { status: number; headers: Headers; body: ApiResponse<T> };

class Visitor {
  cookie = "";
  async call<T>(path: string, init: RequestInit = {}): Promise<Reply<T>> {
    const res = await fetch(app + path, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(init.headers ?? {}),
      },
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    return { status: res.status, headers: res.headers, body: (await res.json()) as ApiResponse<T> };
  }
  health() {
    return this.call<{ store: string; listings: number }>("/api/health");
  }
  search(q: string, extra: Record<string, string> = {}) {
    return this.call<Listing[]>(`/api/search?${new URLSearchParams({ q, ...extra })}`);
  }
  listing(id: string) {
    return this.call<Listing>(`/api/listings/${id}`);
  }
  brands() {
    return this.call<string[]>("/api/brands");
  }
  saved() {
    return this.call<SavedListing[]>("/api/saved");
  }
  save(listingId: string) {
    return this.call<SavedListing>("/api/saved", { method: "POST", body: JSON.stringify({ listingId }) });
  }
  note(listingId: string, note: string | null) {
    return this.call<SavedListing>(`/api/saved/${listingId}`, { method: "PATCH", body: JSON.stringify({ note }) });
  }
  unsave(listingId: string) {
    return this.call<{ removed: string }>(`/api/saved/${listingId}`, { method: "DELETE" });
  }
  recent() {
    return this.call<Listing[]>("/api/recent");
  }
  view(listingId: string) {
    return this.call<{ recorded: string }>("/api/recent", { method: "POST", body: JSON.stringify({ listingId }) });
  }
  clearRecent() {
    return this.call<{ cleared: boolean }>("/api/recent", { method: "DELETE" });
  }
  outage(on: boolean) {
    return this.call<{ outage: boolean }>("/api/dev/outage", { method: "POST", body: JSON.stringify({ on }) });
  }
}

function data<T>(r: Reply<T>): T {
  assert.equal(r.body.ok, true, `expected success, got HTTP ${r.status}: ${JSON.stringify(r.body)}`);
  return (r.body as { ok: true; data: T }).data;
}

function failure<T>(r: Reply<T>, status: number): string {
  assert.equal(r.status, status, `expected HTTP ${status}, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.ok, false);
  return (r.body as { ok: false; error: string }).error;
}

/* ---------- the API itself ---------- */

test("GET / and GET /api describe the endpoints", async () => {
  for (const path of ["/", "/api"]) {
    const r = await new Visitor().call<{ name: string; endpoints: string[] }>(path);
    assert.equal(r.status, 200);
    const d = data(r);
    assert.equal(d.name, "Resale Finder API");
    assert.ok(d.endpoints.some((e) => e.includes("/api/search")));
  }
});

test("an unknown /api path answers 404 in the JSON envelope, not an HTML page", async () => {
  const r = await new Visitor().call("/api/does-not-exist");
  assert.match(failure(r, 404), /No such endpoint/);
  assert.match(r.headers.get("content-type") ?? "", /application\/json/);
});

test("GET /api/health reports the store is up and holds every practice listing", async () => {
  const h = data(await new Visitor().health());
  assert.equal(h.store, "ok");
  assert.equal(h.listings, listings.length);
});

test("API responses are never cached", async () => {
  const v = new Visitor();
  assert.equal((await v.search("hoodie")).headers.get("cache-control"), "no-store");
  assert.equal((await v.search("")).headers.get("cache-control"), "no-store");
});

/* ---------- acceptance criteria ---------- */

test("AC2: “Chrome Hearts hoodie” returns relevant listings, cheapest first", async () => {
  const results = data(await new Visitor().search("Chrome Hearts hoodie"));
  assert.ok(results.length > 0, "expected at least one result");
  for (const l of results) {
    assert.equal(l.brand, "Chrome Hearts");
    assert.match(`${l.title} ${l.description}`, /hoodie/i);
  }
  const prices = results.map((l) => l.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
});

test("search matches every word, in any field, ignoring case and a plural s", async () => {
  const v = new Visitor();
  const a = data(await v.search("HOODIE chrome")).map((l) => l.id);
  const b = data(await v.search("chrome hoodies")).map((l) => l.id);
  assert.ok(a.length > 0);
  assert.deepEqual(a, b);
  assert.deepEqual(data(await v.search("hoodie zzzznotaword")), []);
});

test("results can be sorted by price in either direction; unknown sorts are rejected", async () => {
  const v = new Visitor();
  const asc = data(await v.search("hoodie", { sort: "price-asc" })).map((l) => l.price);
  const desc = data(await v.search("hoodie", { sort: "price-desc" })).map((l) => l.price);
  assert.ok(asc.length > 1);
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  assert.deepEqual(desc, [...asc].reverse());
  assert.match(failure(await v.search("hoodie", { sort: "cheapest" }), 400), /Sort must be/);
});

test("AC3: brand + size + max price filters narrow the results", async () => {
  const results = data(await new Visitor().search("hoodie", { brand: "Chrome Hearts", size: "M", maxPrice: "300" }));
  assert.ok(results.length > 0);
  for (const l of results) {
    assert.equal(l.brand, "Chrome Hearts");
    assert.equal(l.size, "M");
    assert.ok(l.price <= 300, `${l.id} costs ${l.price}`);
  }
  const unfiltered = data(await new Visitor().search("hoodie"));
  assert.ok(unfiltered.length > results.length, "filters should remove something");
});

test("AC4/AC5: blank term and bad prices are rejected with HTTP 400", async () => {
  const v = new Visitor();
  assert.match(failure(await v.search("   "), 400), /Enter something/);
  assert.match(failure(await v.search("hoodie", { maxPrice: "-5" }), 400), /negative/);
  assert.match(failure(await v.search("hoodie", { maxPrice: "abc" }), 400), /number/);
  assert.match(failure(await v.search("hoodie", { maxPrice: "12.345" }), 400), /number/);
});

test("AC6/AC7: every result names its marketplace and links to the original listing", async () => {
  const results = data(await new Visitor().search("jacket"));
  assert.ok(results.length > 0);
  const marketplaces = new Set(listings.map((r) => r.marketplace));
  for (const l of results) {
    assert.ok(marketplaces.has(l.marketplace), `unknown marketplace ${l.marketplace}`);
    assert.match(l.listing_url, /^https:\/\//);
    assert.match(l.image_url, /^\/images\/.+\.svg$/);
    for (const key of ["id", "title", "brand", "price", "size"] as const) assert.ok(key in l);
  }
});

test("GET /api/listings/:id returns one listing, 404 for a bogus id", async () => {
  const v = new Visitor();
  const l = data(await v.listing("ch-001"));
  assert.equal(l.title, "Cross Patch Pullover Hoodie");
  assert.equal(typeof l.price, "number");
  assert.match(failure(await v.listing("nope"), 404), /no longer exists/);
});

test("AC8/AC9/AC10: save → appears in Saved → survives a “refresh” → remove → gone", async () => {
  const v = new Visitor();
  assert.deepEqual(data(await v.saved()), []);
  assert.ok(v.cookie.startsWith("rf_visitor="), "server should issue the visitor cookie");

  const saved = await v.save("ch-001");
  assert.equal(saved.status, 201);
  assert.equal(data(saved).id, "ch-001");

  // "Refresh": a fresh request carrying the same cookie.
  const again = new Visitor();
  again.cookie = v.cookie;
  assert.deepEqual(data(await again.saved()).map((l) => l.id), ["ch-001"]);

  // A different browser (no cookie) has its own, empty list.
  assert.deepEqual(data(await new Visitor().saved()), []);

  assert.deepEqual(data(await v.unsave("ch-001")), { removed: "ch-001" });
  assert.deepEqual(data(await v.saved()), []);
});

test("saved listings come back newest first", async () => {
  const v = new Visitor();
  for (const id of ["ch-001", "nike-001", "levi-001"]) data(await v.save(id));
  assert.deepEqual(data(await v.saved()).map((l) => l.id), ["levi-001", "nike-001", "ch-001"]);
});

test("saving the same listing twice is idempotent; bad requests are 400/404", async () => {
  const v = new Visitor();
  data(await v.save("nike-001"));
  data(await v.save("nike-001"));
  assert.equal(data(await v.saved()).length, 1);
  assert.match(failure(await v.save("does-not-exist"), 404), /no longer exists/);
  assert.match(failure(await v.call("/api/saved", { method: "POST", body: "{}" }), 400), /listingId/);
  assert.match(failure(await v.call("/api/saved", { method: "POST", body: "not json" }), 400), /JSON/);
});

test("notes: a saved listing can carry a note; it survives a re-save and can be cleared", async () => {
  const v = new Visitor();
  assert.equal(data(await v.save("levi-001")).note, null);

  const withNote = data(await v.note("levi-001", "  ask about the fade  "));
  assert.equal(withNote.note, "ask about the fade");
  assert.equal(withNote.id, "levi-001");
  assert.equal(data(await v.saved())[0].note, "ask about the fade");

  // Saving again (e.g. a double click) must not wipe the note.
  assert.equal(data(await v.save("levi-001")).note, "ask about the fade");

  // Blank clears it.
  assert.equal(data(await v.note("levi-001", "")).note, null);
  assert.equal(data(await v.note("levi-001", null)).note, null);

  // Validation and ownership.
  assert.match(failure(await v.note("levi-001", "x".repeat(MAX_NOTE_LENGTH + 1)), 400), /under 300/);
  assert.match(failure(await v.call("/api/saved/levi-001", { method: "PATCH", body: JSON.stringify({ note: 5 }) }), 400), /text/);
  assert.match(failure(await v.note("ch-001", "not saved"), 404), /isn't in your saved list/);
  assert.match(failure(await new Visitor().note("levi-001", "someone else's"), 404), /isn't in your saved list/);
});

test("GET /api/brands lists every brand once, A–Z", async () => {
  const brands = data(await new Visitor().brands());
  const expected = [...new Set(listings.map((r) => r.brand))].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(brands, expected);
});

test("MVP8: recently viewed keeps the 10 most recent *unsaved* listings, newest first", async () => {
  const v = new Visitor();
  const ids = listings.slice(0, 12).map((r) => r.id);
  for (const id of ids) data(await v.view(id));
  const recent = data(await v.recent()).map((l) => l.id);
  assert.equal(recent.length, 10);
  assert.deepEqual(recent, [...ids].reverse().slice(0, 10));

  // Viewing something again moves it to the front.
  data(await v.view(recent[5]));
  assert.equal(data(await v.recent())[0].id, recent[5]);

  // Saving one drops it from Recently viewed; viewing a saved one doesn't add it back.
  data(await v.save(recent[0]));
  data(await v.view(recent[0]));
  const after = data(await v.recent()).map((l) => l.id);
  assert.ok(!after.includes(recent[0]));
  assert.equal(after.length, 9);

  assert.match(failure(await v.view("does-not-exist"), 404), /no longer exists/);
  assert.match(failure(await v.call("/api/recent", { method: "POST", body: "{}" }), 400), /listingId/);

  // Clear history: only this visitor's rows go.
  const other = new Visitor();
  data(await other.view("ch-002"));
  assert.deepEqual(data(await v.clearRecent()), { cleared: true });
  assert.deepEqual(data(await v.recent()), []);
  assert.deepEqual(data(await other.recent()).map((l) => l.id), ["ch-002"]);
});

test("AC11: when the store fails, every route reports an error instead of pretending", async (t) => {
  const v = new Visitor();
  const toggle = await v.outage(true);
  if (toggle.status === 404) {
    t.skip("the outage switch only exists in development (`npm run dev`), not in a production build");
    return;
  }
  assert.equal(data(toggle).outage, true);
  try {
    assert.match(failure(await v.search("hoodie"), 500), /went wrong/);
    assert.match(failure(await v.saved(), 500), /went wrong/);
    assert.match(failure(await v.save("ch-001"), 500), /went wrong/);
    assert.match(failure(await v.recent(), 500), /went wrong/);
    assert.match(failure(await v.brands(), 500), /went wrong/);
    assert.match(failure(await v.health(), 503), /unavailable/i);
  } finally {
    data(await v.outage(false));
  }
  // …and recovers.
  assert.ok(data(await new Visitor().search("hoodie")).length > 0);
  assert.equal(data(await new Visitor().health()).store, "ok");
});
