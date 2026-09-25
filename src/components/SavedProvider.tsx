"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import type { Listing, SavedListing } from "@/lib/types";

type Status = "loading" | "ready" | "error";

type SavedContextValue = {
  status: Status;
  /** Why the initial load failed, if it did. */
  loadError: string | null;
  saved: SavedListing[];
  isSaved: (id: string) => boolean;
  /** Ids with a save/remove request in flight. */
  pending: Set<string>;
  save: (listing: Listing) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Stores the visitor's note on a saved listing (null clears it). */
  setNote: (id: string, note: string | null) => Promise<void>;
  reload: () => Promise<void>;
};

const SavedContext = createContext<SavedContextValue | null>(null);

/**
 * One source of truth for the visitor's saved listings. Loaded once from
 * /api/saved (which is what makes saves survive a refresh) and shared by the
 * search results, the listing page and the Saved page.
 */
export function SavedProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedListing[]>([]);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const listeners = useRef(new Set<() => void>());

  // Bumping this re-runs the initial load (used by "Try again").
  const [loadCount, setLoadCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    apiFetch<SavedListing[]>("/api/saved", { cache: "no-store" }).then(
      (data) => {
        if (cancelled) return;
        setSaved(data);
        setLoadError(null);
        setStatus("ready");
      },
      (err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Could not load saved listings.");
        setStatus("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadCount]);

  const reload = useCallback(async () => {
    setStatus("loading");
    setLoadError(null);
    setLoadCount((c) => c + 1);
  }, []);

  const markPending = (id: string, on: boolean) =>
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // Nothing is updated optimistically: the UI only flips to "Saved" once the
  // server has confirmed the write, so a backend failure can't be mistaken for success.
  const save = useCallback(async (listing: Listing) => {
    markPending(listing.id, true);
    try {
      const confirmed = await apiFetch<SavedListing>("/api/saved", {
        method: "POST",
        body: JSON.stringify({ listingId: listing.id }),
      });
      setSaved((prev) => [confirmed, ...prev.filter((l) => l.id !== confirmed.id)]);
      listeners.current.forEach((fn) => fn());
    } finally {
      markPending(listing.id, false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    markPending(id, true);
    try {
      await apiFetch<{ removed: string }>(`/api/saved/${encodeURIComponent(id)}`, { method: "DELETE" });
      setSaved((prev) => prev.filter((l) => l.id !== id));
    } finally {
      markPending(id, false);
    }
  }, []);

  const setNote = useCallback(async (id: string, note: string | null) => {
    const updated = await apiFetch<SavedListing>(`/api/saved/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ note }),
    });
    setSaved((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }, []);

  const value = useMemo<SavedContextValue>(
    () => ({
      status,
      loadError,
      saved,
      isSaved: (id) => saved.some((l) => l.id === id),
      pending,
      save,
      remove,
      setNote,
      reload,
    }),
    [status, loadError, saved, pending, save, remove, setNote, reload],
  );

  return (
    <SavedContext.Provider value={value}>
      <SavedEvents listeners={listeners}>{children}</SavedEvents>
    </SavedContext.Provider>
  );
}

// Lets "Recently viewed" refresh itself when something gets saved (a saved
// listing is removed from the recent list on the server).
const SavedEventsContext = createContext<React.RefObject<Set<() => void>> | null>(null);
function SavedEvents({
  listeners,
  children,
}: {
  listeners: React.RefObject<Set<() => void>>;
  children: React.ReactNode;
}) {
  return <SavedEventsContext.Provider value={listeners}>{children}</SavedEventsContext.Provider>;
}

export function useOnSaved(fn: () => void) {
  const ref = useContext(SavedEventsContext);
  useEffect(() => {
    const set = ref?.current;
    if (!set) return;
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }, [ref, fn]);
}

export function useSaved(): SavedContextValue {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error("useSaved must be used inside <SavedProvider>");
  return ctx;
}
