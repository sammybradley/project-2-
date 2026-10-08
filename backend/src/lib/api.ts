import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import type { ApiErr, ApiOk } from "@/lib/types";
import { HttpError, StoreUnavailable } from "@/lib/errors";
import { storageDescription } from "@/lib/store";

export { HttpError };

// API answers are per-visitor and change on every save, so nothing – browser,
// CDN or proxy – may cache them.
const NO_STORE = { "Cache-Control": "no-store" };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiOk<T>>({ ok: true, data }, { ...init, headers: { ...NO_STORE, ...init?.headers } });
}

export function fail(status: number, error: string) {
  return NextResponse.json<ApiErr>({ ok: false, error }, { status, headers: NO_STORE });
}

const GENERIC_ERROR = "Something went wrong on the server. Please try again.";

/**
 * Wraps a Route Handler so that
 *  - every failure becomes a JSON `{ ok: false, error }` with a sensible status
 *    (never an HTML error page the client can't parse), and
 *  - every request is printed to the terminal with its status code, so you can
 *    watch requests arrive while the backend runs.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    const started = performance.now();
    let res: Response;
    try {
      res = await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) res = fail(err.status, err.message);
      else {
        // Expected failures (the store being down) get one line; anything else is a bug – keep the stack.
        if (err instanceof StoreUnavailable) console.error(`[store] ${err.message}`);
        else console.error(err);
        res = fail(500, GENERIC_ERROR);
      }
    }
    logRequest(args[0] as Request, res.status, performance.now() - started);
    return res;
  };
}

// 2xx green, 4xx yellow, 5xx red – only when writing to a real terminal
// (or when the parent process asks for colour, as scripts/dev.mjs does).
const colour = (status: number, text: string) => {
  if (!process.stdout.isTTY && !process.env.FORCE_COLOR) return text;
  const code = status >= 500 ? 31 : status >= 400 ? 33 : 32;
  return `\x1b[${code}m${text}\x1b[0m`;
};

function logRequest(req: Request, status: number, ms: number) {
  const { pathname, search } = new URL(req.url);
  const time = new Date().toLocaleTimeString("en-GB");
  console.log(`${time}  ${req.method.padEnd(6)} ${pathname}${search}  ${colour(status, String(status))}  ${Math.max(1, Math.round(ms))} ms`);
}

const VISITOR_COOKIE = "rf_visitor";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * There are no accounts, so each browser is identified by an anonymous, httpOnly
 * cookie that the server issues on first contact. Saved and recently-viewed rows
 * are keyed by it, which is what lets them survive a refresh.
 */
export async function getVisitorId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) return existing;

  const id = randomUUID();
  // Not marked `secure`: the id is an anonymous, non-sensitive token, and a
  // secure cookie would silently break saves over plain http on localhost.
  jar.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

/** Reads a JSON body, turning malformed JSON into a 400 instead of a 500. */
export async function readJson<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
}

/** `GET /` and `GET /api`: what this backend offers. */
export function describeApi() {
  return ok({
    name: "Resale Finder API",
    storage: storageDescription,
    endpoints: [
      "GET    /api/health",
      "GET    /api/session",
      "GET    /api/search?q=&brand=&size=&maxPrice=&sort=price-asc|price-desc",
      "GET    /api/listings/:id",
      "GET    /api/brands",
      "GET    /api/saved",
      "POST   /api/saved            { listingId }",
      "PATCH  /api/saved/:id        { note }",
      "DELETE /api/saved/:id",
      "GET    /api/recent",
      "POST   /api/recent           { listingId }",
      "DELETE /api/recent",
    ],
  });
}
