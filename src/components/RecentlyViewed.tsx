"use client";

import { useCallback, useEffect, useState } from "react";
import { ListingGrid } from "@/components/ListingCard";
import { useOnSaved, useSaved } from "@/components/SavedProvider";
import { EmptyState, ErrorBanner, Spinner } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";
import type { Listing } from "@/lib/types";

/**
 * The 10 listings the visitor opened most recently but hasn't saved. The server
 * keeps the list trimmed; here we also hide anything saved since the fetch.
 */
export function RecentlyViewed() {
  const [items, setItems] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const { isSaved } = useSaved();

  // Bumping this refetches (on "Try again", and after something is saved).
  const [loadCount, setLoadCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    apiFetch<Listing[]>("/api/recent", { cache: "no-store" }).then(
      (data) => {
        if (cancelled) return;
        setItems(data);
        setError(null);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load recently viewed.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadCount]);

  const load = useCallback(() => {
    setError(null);
    setLoadCount((c) => c + 1);
  }, []);
  useOnSaved(load);

  const visible = items?.filter((l) => !isSaved(l.id)) ?? [];

  // Clears the history on the server first; the list only empties once that succeeds.
  const clear = async () => {
    setClearing(true);
    setClearError(null);
    try {
      await apiFetch<{ cleared: boolean }>("/api/recent", { method: "DELETE" });
      setItems([]);
    } catch (err) {
      setClearError(err instanceof Error ? err.message : "Could not clear history.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <section aria-labelledby="recent-heading" className="mt-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="recent-heading" className="text-lg font-semibold">
          Recently viewed
        </h2>
        {visible.length > 0 && (
          <button type="button" onClick={clear} disabled={clearing} className="btn-secondary py-1 text-xs">
            {clearing ? "Clearing…" : "Clear history"}
          </button>
        )}
      </div>
      {clearError && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          Couldn&apos;t clear history: {clearError}
        </p>
      )}
      {error ? (
        <ErrorBanner title="Couldn't load recently viewed listings" message={error} onRetry={load} />
      ) : items === null ? (
        <Spinner label="Loading recently viewed…" />
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing viewed yet" hint="Listings you open (but don't save) show up here — the 10 most recent." />
      ) : (
        <ListingGrid listings={visible} />
      )}
    </section>
  );
}
