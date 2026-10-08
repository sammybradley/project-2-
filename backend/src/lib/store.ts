// The backend's storage, as the Route Handlers see it.
//
// Two implementations exist behind the same interface (store-types.ts):
//   - store-supabase.ts  when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
//                        set (backend/.env.local) – rows persist in Supabase
//   - store-memory.ts    otherwise – plain arrays, gone when the server stops
//
// This file picks one at startup, adds the development-only "outage" switch,
// and re-exports the functions the routes call. Nothing else imports the two
// implementations directly.

import { HttpError, StoreUnavailable } from "@/lib/errors";
import { memoryStore } from "@/lib/store-memory";
import { supabaseStore } from "@/lib/store-supabase";
import { supabaseConfigured } from "@/lib/supabase";
import { MAX_NOTE_LENGTH } from "@/lib/types";
import type { StoreBackend } from "@/lib/store-types";

export { RECENT_LIMIT } from "@/lib/store-types";

const backend: StoreBackend = supabaseConfigured ? supabaseStore : memoryStore;

/** Which store is running, for GET / and GET /api. */
export const storageDescription = backend.description;
/** "supabase" or "memory" – and whether rows outlive the process (GET /api/health, GET /api/session). */
export const storeKind = backend.kind;
export const storePersistent = backend.persistent;

// The outage flag lives on globalThis so `next dev` re-compiling this module
// doesn't reset it mid-test.
const g = globalThis as typeof globalThis & { __resaleFinderOutage?: boolean };

/** Development only (see /api/dev/outage): make every query fail, or recover. */
export function setOutage(on: boolean): boolean {
  g.__resaleFinderOutage = on;
  return on;
}
export function isOutage(): boolean {
  return g.__resaleFinderOutage === true;
}

function guarded<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args) => {
    if (isOutage()) throw new StoreUnavailable("The store is unavailable (simulated outage).");
    return fn(...args);
  };
}

export const countListings = guarded(backend.countListings);
export const searchListings = guarded(backend.searchListings);
export const listBrands = guarded(backend.listBrands);
export const getListing = guarded(backend.getListing);
export const getSavedListings = guarded(backend.getSavedListings);
export const saveListing = guarded(backend.saveListing);
export const setSavedNote = guarded(backend.setSavedNote);
export const removeSavedListing = guarded(backend.removeSavedListing);
export const getRecentlyViewed = guarded(backend.getRecentlyViewed);
export const clearRecentlyViewed = guarded(backend.clearRecentlyViewed);
export const recordView = guarded(backend.recordView);

/** Validates a note the way the API expects it: trimmed, capped, blank means "no note". */
export function normaliseNote(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") throw new HttpError(400, "note must be text.");
  const note = raw.trim();
  if (note.length > MAX_NOTE_LENGTH) throw new HttpError(400, `Keep the note under ${MAX_NOTE_LENGTH} characters.`);
  return note || null;
}
