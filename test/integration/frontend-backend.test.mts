// Integration test: the frontend (this folder) talking to the backend (backend/).
//
//   npm run test:integration
//
// Checks that requests the browser would make to the frontend's /api/* really
// reach the backend – with the visitor cookie and the status codes intact – and
// that the page renders without any trace of the old mock database.
//
// If `npm run dev` is already running (frontend on 3000, backend on 4000) the
// tests use those servers; otherwise they start their own pair on spare ports.
// (Next.js allows one dev server per project folder, so it can't be both.)

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiResponse, SavedListing } from "../../src/lib/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const listingCount = (JSON.parse(readFileSync(join(root, "backend/data/listings.json"), "utf8")) as unknown[]).length;
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

type App = { url: string; child?: ChildProcess; log: string };

async function isUp(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/api/health`);
    return !!r.headers.get("content-type")?.includes("json");
  } catch {
    return false;
  }
}

async function start(name: string, cwd: string, port: number, env: Record<string, string>): Promise<App> {
  const child = spawn("npx", ["next", "dev", "-p", String(port), "-H", "127.0.0.1"], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const app: App = { url: `http://127.0.0.1:${port}`, child, log: "" };
  child.stdout?.on("data", (d) => (app.log += d));
  child.stderr?.on("data", (d) => (app.log += d));
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${app.url}/api/health`);
      if (r.headers.get("content-type")?.includes("json")) return app;
    } catch {}
    if (child.exitCode !== null) break;
    await sleep(300);
  }
  throw new Error(`${name} did not come up:\n${app.log}`);
}

let backend: App;
let web: App;

before(async () => {
  if ((await isUp("http://localhost:4000")) && (await isUp("http://localhost:3000"))) {
    console.log("Using the frontend (3000) and backend (4000) that are already running");
    backend = { url: "http://localhost:4000", log: "" };
    web = { url: "http://localhost:3000", log: "" };
    return;
  }
  backend = await start("backend", join(root, "backend"), await freePort(), {});
  web = await start("frontend", root, await freePort(), { BACKEND_URL: backend.url });
});

after(() => {
  web?.child?.kill("SIGTERM");
  backend?.child?.kill("SIGTERM");
});

async function json<T>(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  return { status: res.status, headers: res.headers, body: (await res.json()) as ApiResponse<T> };
}

test("the frontend forwards /api/* to the backend", async () => {
  const r = await json<{ store: string; listings: number }>(`${web.url}/api/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, data: { store: "ok", listings: listingCount } });
  assert.equal(r.headers.get("cache-control"), "no-store");
});

test("status codes pass through: a bad search is a 400 at the frontend too", async () => {
  const r = await json(`${web.url}/api/search?q=`);
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { ok: false, error: "Enter something to search for." });
});

test("the visitor cookie round-trips through the frontend, so saves stick", async () => {
  const saved = await fetch(`${web.url}/api/saved`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "ch-001" }),
  });
  assert.equal(saved.status, 201);
  const cookie = saved.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert.match(cookie, /^rf_visitor=/, "the backend's cookie should reach the browser");

  // "Refresh": the browser sends the cookie back through the frontend…
  const viaFrontend = await json<SavedListing[]>(`${web.url}/api/saved`, { headers: { Cookie: cookie } });
  assert.equal(viaFrontend.status, 200);
  assert.deepEqual(viaFrontend.body.ok && viaFrontend.body.data.map((l) => l.id), ["ch-001"]);

  // …and it is the very same backend store, not something the frontend made up.
  const viaBackend = await json<SavedListing[]>(`${backend.url}/api/saved`, { headers: { Cookie: cookie } });
  assert.deepEqual(viaBackend.body, viaFrontend.body);

  const removed = await json(`${web.url}/api/saved/ch-001`, { method: "DELETE", headers: { Cookie: cookie } });
  assert.equal(removed.status, 200);
});

test("the search page renders and mentions no mock data", async () => {
  const res = await fetch(web.url);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Find it on resale/);
  assert.doesNotMatch(html, /mock/i);
  assert.doesNotMatch(html, /supabase/i);
});

test("when the backend is down the frontend reports an error instead of pretending", async (t) => {
  if (!backend.child) {
    t.skip("can't stop a backend this test didn't start – run with `npm run dev` stopped to cover this");
    return;
  }
  backend.child.kill("SIGTERM");
  const deadline = Date.now() + 10_000;
  while (backend.child.exitCode === null && Date.now() < deadline) await sleep(100);
  const res = await fetch(`${web.url}/api/health`);
  assert.ok(res.status >= 500, `expected a 5xx, got ${res.status}`);
});
