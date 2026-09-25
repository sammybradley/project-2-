import type { ApiResponse } from "@/lib/types";

/**
 * Calls one of our Route Handlers and unwraps the `{ ok, data | error }` envelope.
 * Anything that isn't a clean success – a 4xx/5xx, a network failure, or a body
 * that isn't our JSON shape – becomes a thrown Error with a readable message, so
 * callers can never mistake a failed request for a successful one.
 */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  let body: ApiResponse<T> | undefined;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    body = undefined;
  }

  if (!body || typeof body !== "object" || !("ok" in body)) {
    throw new Error(`The server returned an unexpected response (HTTP ${res.status}).`);
  }
  if (!body.ok) throw new Error(body.error || `Request failed (HTTP ${res.status}).`);
  if (!res.ok) throw new Error(`Request failed (HTTP ${res.status}).`);
  return body.data;
}

/**
 * Tells the server the visitor opened a listing so it shows up in "Recently viewed".
 * `keepalive` lets the request finish even if the tab is navigating away.
 */
export function recordView(listingId: string): Promise<void> {
  return apiFetch<{ recorded: string }>("/api/recent", {
    method: "POST",
    body: JSON.stringify({ listingId }),
    keepalive: true,
  }).then(() => undefined);
}
