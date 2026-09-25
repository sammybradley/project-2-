// End-to-end test of the Route Handlers: the *built* Next.js app (`next start`)
// talking to the in-memory mock Supabase (scripts/mock-supabase.mjs).
//
//   npm run test:e2e        (runs `next build` first)
//
// Walks the spec's acceptance criteria over real HTTP, cookie included, so the
// visitor-id, envelope, validation and error paths are all exercised as the
// browser would see them.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { createMockSupabase, mockEnv } from "../../scripts/mock-supabase.mjs";
import { loadListingRows, projectRoot } from "../../scripts/lib/listing-rows.mjs";
import type { ApiResponse, Listing, SavedListing } from "../../src/lib/types.ts";

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let app = "";
let mockUrl = "";
let closeMock: () => Promise<void>;
let child: ChildProcess | undefined;

before(async () => {
  assert.ok(
    existsSync(join(projectRoot, ".next/BUILD_ID")),
    "No production build found – run `npm run build` first (or use `npm run test:e2e`).",
  );

  const mock = await createMockSupabase().listen(0);
  mockUrl = mock.url;
  closeMock = mock.close;

  const port = await freePort();
  app = `http://127.0.0.1:${port}`;
  child = spawn("npx", ["next", "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: projectRoot,
    env: { ...process.env, ...mockEnv(mockUrl), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout?.on("data", (d) => (log += d));
  child.stderr?.on("data", (d) => (log += d));

  // Wait until the server answers.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${app}/api/search?q=hoodie`);
      if (r.status < 500 || r.headers.get("content-type")?.includes("json")) return;
    } catch {}
    if (child.exitCode !== null) break;
    await sleep(250);
  }
  throw new Error(`next start did not come up:\n${log}`);
});

after(async () => {
  child?.kill("SIGTERM");
  await closeMock?.();
});

/* ---------- a tiny client that keeps the visitor cookie, like a browser ---------- */

class Visitor {
  cookie = "";
  async call<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: ApiResponse<T> }> {
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
    return { status: res.status, body: (await res.json()) as ApiResponse<T> };
  }
  health() {
    return this.call<{ database: string; listings: number }>("/api/health");
  }
  clearRecent() {
    return this.call<{ cleared: boolean }>("/api/recent", { method: "DELETE" });
  }
  search(q: string, extra: Record<string, string> = {}) {
    return this.call<Listing[]>(`/api/search?${new URLSearchParams({ q, ...extra })}`);
  }
  save(listingId: string) {
    return this.call<SavedListing>("/api/saved", { method: "POST", body: JSON.stringify({ listingId }) });
  }
  note(listingId: string, note: string | null) {
    return this.call<SavedListing>(`/api/saved/${listingId}`, { method: "PATCH", body: JSON.stringify({ note }) });
  }
  brands() {
    return this.call<string[]>("/api/brands");
  }
  unsave(listingId: string) {
    return this.call<{ removed: string }>(`/api/saved/${listingId}`, { method: "DELETE" });
  }
  saved() {
    return this.call<SavedListing[]>("/api/saved");
  }
  view(listingId: string) {
    return this.call<{ recorded: string }>("/api/recent", { method: "POST", body: JSON.stringify({ listingId }) });
  }
  recent() {
    return this.call<Listing[]>("/api/recent");
  }
}

function data<T>(r: { status: number; body: ApiResponse<T> }): T {
  assert.equal(r.body.ok, true, `expected success, got HTTP ${r.status}: ${JSON.stringify(r.body)}`);
  return (r.body as { ok: true; data: T }).data;
}

function failure<T>(r: { status: number; body: ApiResponse<T> }, status: number): string {
  assert.equal(r.status, status, `expected HTTP ${status}, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.ok, false);
  return (r.body as { ok: false; error: string }).error;
}

/* ---------- acceptance criteria ---------- */

test("AC2: “Chrome Hearts hoodie” returns relevant listings", async () => {
  const results = data(await new Visitor().search("Chrome Hearts hoodie"));
  assert.ok(results.length > 0, "expected at least one result");
  for (const l of results) {
    assert.equal(l.brand, "Chrome Hearts");
    assert.match(`${l.title} ${l.description}`, /hoodie/i);
  }
  // Sorted cheapest first, like the UI promises.
  const prices = results.map((l) => l.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
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

test("API responses are never cached", async () => {
  const res = await fetch(`${app}/api/search?q=hoodie`);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const bad = await fetch(`${app}/api/search?q=`);
  assert.equal(bad.headers.get("cache-control"), "no-store");
});

test("GET /api/health reports the database is reachable and seeded", async () => {
  const h = data(await new Visitor().health());
  assert.equal(h.database, "ok");
  assert.equal(h.listings, loadListingRows().length);
});

test("AC3: brand + size + max price filters narrow the results", async () => {
  const results = data(
    await new Visitor().search("hoodie", { brand: "Chrome Hearts", size: "M", maxPrice: "300" }),
  );
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
});

test("AC6/AC7: every result names its marketplace and links to the original listing", async () => {
  const results = data(await new Visitor().search("jacket"));
  assert.ok(results.length > 0);
  const marketplaces = new Set(loadListingRows().map((r) => r.marketplace));
  for (const l of results) {
    assert.ok(marketplaces.has(l.marketplace), `unknown marketplace ${l.marketplace}`);
    assert.match(l.listing_url, /^https:\/\//);
    assert.match(l.image_url, /^\/images\/.+\.svg$/);
    for (const key of ["id", "title", "brand", "price", "size"] as const) assert.ok(key in l);
  }
});

test("GET /api/listings/:id returns one listing, 404 for a bogus id", async () => {
  const v = new Visitor();
  const l = data(await v.call<Listing>("/api/listings/ch-001"));
  assert.equal(l.title, "Cross Patch Pullover Hoodie");
  assert.equal(typeof l.price, "number");
  assert.match(failure(await v.call<Listing>("/api/listings/nope"), 404), /no longer exists/);
});

test("AC8/AC9/AC10: save → appears in Saved → survives a “refresh” → remove → gone", async () => {
  const v = new Visitor();
  assert.deepEqual(data(await v.saved()), []);
  assert.ok(v.cookie.startsWith("rf_visitor="), "server should issue the visitor cookie");

  const saved = await v.save("ch-001");
  assert.equal(saved.status, 201);
  assert.equal(data(saved).id, "ch-001");

  // "Refresh": a fresh request with the same cookie.
  const again = new Visitor();
  again.cookie = v.cookie;
  assert.deepEqual(
    data(await again.saved()).map((l) => l.id),
    ["ch-001"],
  );

  // A different browser (no cookie) has its own, empty list.
  assert.deepEqual(data(await new Visitor().saved()), []);

  assert.deepEqual(data(await v.unsave("ch-001")), { removed: "ch-001" });
  assert.deepEqual(data(await v.saved()), []);
});

test("saving the same listing twice is idempotent; saving a bogus id is a 404", async () => {
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

  // Saving again (e.g. double click) must not wipe the note.
  assert.equal(data(await v.save("levi-001")).note, "ask about the fade");

  // Blank clears it.
  assert.equal(data(await v.note("levi-001", "")).note, null);
  assert.equal(data(await v.note("levi-001", null)).note, null);

  // Validation and ownership.
  assert.match(failure(await v.note("levi-001", "x".repeat(301)), 400), /under 300/);
  assert.match(failure(await v.call("/api/saved/levi-001", { method: "PATCH", body: JSON.stringify({ note: 5 }) }), 400), /text/);
  assert.match(failure(await v.note("ch-001", "not saved"), 404), /isn't in your saved list/);
  assert.match(failure(await new Visitor().note("levi-001", "someone else's"), 404), /isn't in your saved list/);
});

test("GET /api/brands lists every brand once, A–Z", async () => {
  const brands = data(await new Visitor().brands());
  const expected = [...new Set(loadListingRows().map((r) => r.brand))].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(brands, expected);
});

test("MVP8: recently viewed keeps the 10 most recent *unsaved* listings, newest first", async () => {
  const v = new Visitor();
  const ids = loadListingRows()
    .slice(0, 12)
    .map((r) => r.id);
  for (const id of ids) {
    data(await v.view(id));
    await sleep(5); // distinct viewed_at timestamps
  }
  const recent = data(await v.recent()).map((l) => l.id);
  assert.equal(recent.length, 10);
  assert.deepEqual(recent, [...ids].reverse().slice(0, 10));

  // Saving one drops it from Recently viewed; viewing a saved one doesn't add it back.
  data(await v.save(recent[0]));
  data(await v.view(recent[0]));
  const after = data(await v.recent()).map((l) => l.id);
  assert.ok(!after.includes(recent[0]));
  assert.equal(after.length, 9);

  assert.match(failure(await v.view("does-not-exist"), 404), /no longer exists/);

  // Clear history: only this visitor's rows go.
  const other = new Visitor();
  data(await other.view("ch-002"));
  assert.deepEqual(data(await v.clearRecent()), { cleared: true });
  assert.deepEqual(data(await v.recent()), []);
  assert.deepEqual(data(await other.recent()).map((l) => l.id), ["ch-002"]);
});

test("AC11: when the database fails, every route reports an error instead of pretending", async () => {
  await fetch(`${mockUrl}/__mock/outage?on=1`);
  try {
    const v = new Visitor();
    assert.match(failure(await v.search("hoodie"), 500), /went wrong/);
    assert.match(failure(await v.saved(), 500), /went wrong/);
    assert.match(failure(await v.save("ch-001"), 500), /went wrong/);
    assert.match(failure(await v.recent(), 500), /went wrong/);
    assert.match(failure(await v.health(), 503), /unreachable/i);
  } finally {
    await fetch(`${mockUrl}/__mock/outage?on=0`);
  }
  // …and recovers.
  assert.ok(data(await new Visitor().search("hoodie")).length > 0);
});
