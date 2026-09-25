"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListingGrid } from "@/components/ListingCard";
import { MarketplaceBadge } from "@/components/ui";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { SearchForm } from "@/components/SearchForm";
import { EmptyState, ErrorBanner, Spinner } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";
import { DEFAULT_SORT, SORTS, type Listing, type SearchParams, type SearchResult, type SortOrder } from "@/lib/types";
import { toSearchQuery, validateSearch } from "@/lib/validate";

// The outcome of one search request, tagged with the query and attempt it answers.
type Outcome =
  | { key: string; attempt: number; kind: "error"; message: string }
  | { key: string; attempt: number; kind: "results"; listings: Listing[]; match: SearchResult["match"] };

/**
 * Home page. The active search lives in the URL (?q=…&brand=…) so a refresh or
 * the back button re-runs it; the form just pushes a new URL.
 */
export function SearchPage() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // Only a valid URL query becomes an active search; garbage in the URL is ignored.
  const active = useMemo<SearchParams | null>(() => {
    if (!sp.get("q")) return null;
    const r = validateSearch({
      q: sp.get("q"),
      brand: sp.get("brand"),
      maxPrice: sp.get("maxPrice"),
      size: sp.get("size"),
      sort: sp.get("sort"),
    });
    return r.ok ? r.params : null;
  }, [sp]);
  const activeKey = active ? toSearchQuery(active) : "";

  useEffect(() => {
    if (!activeKey) return;
    let cancelled = false;
    apiFetch<SearchResult>(`/api/search?${activeKey}`, { cache: "no-store" })
      .then(({ listings, match }) => !cancelled && setOutcome({ key: activeKey, attempt, kind: "results", listings, match }))
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Search failed.";
        setOutcome({ key: activeKey, attempt, kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [activeKey, attempt]);

  // Loading = there is an active query whose latest attempt hasn't answered yet.
  const current = outcome && outcome.key === activeKey && outcome.attempt === attempt ? outcome : null;
  const loading = !!activeKey && !current;
  const retry = () => setAttempt((a) => a + 1);

  const go = (params: SearchParams) => {
    const next = toSearchQuery(params);
    if (next === activeKey) retry(); // same query again: just re-run it
    else router.push(`${pathname}?${next}`);
  };
  // The form doesn't know about sort; keep whatever order the visitor picked.
  const onSearch = (params: SearchParams) => go({ ...params, ...(active?.sort ? { sort: active.sort } : {}) });
  const onSort = (sort: SortOrder) => active && go({ ...active, ...(sort === DEFAULT_SORT ? { sort: undefined } : { sort }) });

  return (
    <>
      {/* Keyed on the query so the fields reset to match the URL on back/forward. */}
      <SearchForm key={activeKey} initial={active} busy={loading} onSearch={onSearch} />

      <section aria-labelledby="results-heading" aria-live="polite" className="mt-6">
        {active && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="results-heading" className="text-lg font-semibold">
              {current?.kind === "results"
                ? `${current.listings.length} result${current.listings.length === 1 ? "" : "s"}`
                : "Results"}{" "}
              <span className="font-normal text-neutral-600">for “{active.q}”</span>
              <ActiveFilters params={active} />
            </h2>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              Sort
              <select
                value={active.sort ?? DEFAULT_SORT}
                onChange={(e) => onSort(e.target.value as SortOrder)}
                className="field w-auto py-1"
                aria-label="Sort results"
              >
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {!activeKey && (
          <EmptyState title="Search across resale marketplaces" hint="Try “Chrome Hearts hoodie”, “vintage jacket” or “gorpcore”." />
        )}
        {loading && <Spinner label="Searching listings…" />}
        {current?.kind === "error" && <ErrorBanner title="Search failed" message={current.message} onRetry={retry} />}
        {current?.kind === "results" &&
          (current.listings.length === 0 ? (
            <EmptyState title="No listings match" hint="Try fewer words, a higher maximum price, or clearing the size and brand filters." />
          ) : (
            <>
              {current.match === "partial" && (
                <p role="status" className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Nothing matches every word in “{active?.q}”. Showing the closest {current.listings.length === 1 ? "listing" : "listings"}{" "}
                  instead, best matches first.
                </p>
              )}
              {/* Keyed on the query so the marketplace selection resets with each new search. */}
              <Results key={activeKey} listings={current.listings} />
            </>
          ))}
      </section>

      <RecentlyViewed />
    </>
  );
}

/**
 * The result grid plus marketplace chips. Chips narrow the results already on
 * the page (no extra request) – handy for "show me just the Grailed ones".
 */
function Results({ listings }: { listings: Listing[] }) {
  const [only, setOnly] = useState<string | null>(null);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of listings) m.set(l.marketplace, (m.get(l.marketplace) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [listings]);
  const visible = only ? listings.filter((l) => l.marketplace === only) : listings;

  return (
    <>
      {counts.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by marketplace">
          <button
            type="button"
            onClick={() => setOnly(null)}
            aria-pressed={only === null}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
              only === null ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            All marketplaces ({listings.length})
          </button>
          {counts.map(([name, n]) => (
            <button
              key={name}
              type="button"
              onClick={() => setOnly(only === name ? null : name)}
              aria-pressed={only === name}
              className={`rounded-full border px-1 py-0.5 text-xs transition ${
                only === name ? "border-neutral-900 ring-2 ring-neutral-900/20" : "border-transparent hover:border-neutral-300"
              }`}
            >
              <MarketplaceBadge name={name} className="rounded-full" /> <span className="pr-1 text-neutral-700">{n}</span>
            </button>
          ))}
        </div>
      )}
      {only && (
        <p className="mb-3 text-sm text-neutral-600">
          Showing {visible.length} of {listings.length} on {only}.
        </p>
      )}
      <ListingGrid listings={visible} />
    </>
  );
}

const SORT_LABELS: Record<SortOrder, string> = {
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
};

function ActiveFilters({ params }: { params: SearchParams }) {
  const chips = [
    params.brand && `Brand: ${params.brand}`,
    params.size && `Size: ${params.size}`,
    params.maxPrice !== undefined && `Under $${params.maxPrice}`,
  ].filter(Boolean) as string[];
  if (!chips.length) return null;
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
      {chips.map((c) => (
        <span key={c} className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-800">
          {c}
        </span>
      ))}
    </span>
  );
}
