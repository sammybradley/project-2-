import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import type { ApiErr, ApiOk } from "@/lib/types";
import { ConfigError } from "@/lib/server/supabase";

/** Thrown by handlers for problems that are the caller's fault (400/404). */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// API answers are per-visitor and change on every save, so nothing – browser,
// CDN or Vercel's edge – may cache them.
const NO_STORE = { "Cache-Control": "no-store" };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiOk<T>>({ ok: true, data }, { ...init, headers: { ...NO_STORE, ...init?.headers } });
}

export function fail(status: number, error: string) {
  return NextResponse.json<ApiErr>({ ok: false, error }, { status, headers: NO_STORE });
}

/**
 * Wraps a Route Handler so every failure becomes a JSON `{ ok: false, error }`
 * with a sensible status, instead of an HTML error page the client can't parse.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message);
      if (err instanceof ConfigError) return fail(500, err.message);
      console.error(err);
      return fail(500, "Something went wrong on the server. Please try again.");
    }
  };
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
  // secure cookie would silently break saves when the app is served over plain
  // http (e.g. `npm start` locally). Vercel serves over https regardless.
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
