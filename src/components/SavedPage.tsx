"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ListingGrid } from "@/components/ListingCard";
import { NoteEditor } from "@/components/NoteEditor";
import { SaveButton } from "@/components/SaveButton";
import { useSaved } from "@/components/SavedProvider";
import { EmptyState, ErrorBanner, MarketplaceBadge, Spinner, formatPrice, formatWhen } from "@/components/ui";
import type { SavedListing } from "@/lib/types";

type View = "grid" | "compare";
type SortKey = "saved" | "price" | "brand" | "marketplace";

const SORT_LABELS: Record<SortKey, string> = {
  saved: "Recently saved",
  price: "Price: low to high",
  brand: "Brand A–Z",
  marketplace: "Marketplace A–Z",
};

function sortListings(list: SavedListing[], key: SortKey): SavedListing[] {
  if (key === "saved") return list; // the server already returns newest-saved first
  return [...list].sort((a, b) =>
    key === "price" ? a.price - b.price : a[key].localeCompare(b[key]) || a.price - b.price,
  );
}

/**
 * The Saved page: everything comes from SavedProvider, which loaded it from
 * /api/saved. Two views of the same list – cards, or a compare table that lines
 * up price / size / marketplace side by side (the point of saving things).
 */
export function SavedPage() {
  const { status, loadError, saved, reload } = useSaved();
  const [view, setView] = useState<View>("grid");
  const [sort, setSort] = useState<SortKey>("saved");

  const sorted = useMemo(() => sortListings(saved, sort), [saved, sort]);
  const cheapest = useMemo(
    () => (saved.length ? saved.reduce((m, l) => (l.price < m.price ? l : m)) : null),
    [saved],
  );
  const priciest = useMemo(
    () => (saved.length ? saved.reduce((m, l) => (l.price > m.price ? l : m)) : null),
    [saved],
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Saved listings</h1>
        {status === "ready" && (
          <p className="text-sm text-neutral-600">
            {saved.length} saved · stored in the database, not in this browser
          </p>
        )}
      </div>

      {status === "loading" && <Spinner label="Loading your saved listings…" />}
      {status === "error" && (
        <ErrorBanner title="Couldn't load saved listings" message={loadError ?? "Unknown error."} onRetry={reload} />
      )}

      {status === "ready" && saved.length === 0 && (
        <>
          <EmptyState title="Nothing saved yet" hint="Hit “Save” on any listing to keep it here for comparing later." />
          <div className="mt-4 text-center">
            <Link href="/" className="btn-primary">
              Go search
            </Link>
          </div>
        </>
      )}

      {status === "ready" && saved.length > 0 && (
        <>
          <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
            Loaded {saved.length} saved {saved.length === 1 ? "listing" : "listings"} from the Supabase database for this browser. Nothing here is kept in
            the page or in browser storage – refresh, close the tab or come back tomorrow and the database will still list them.
            Oldest save: {formatWhen(saved[saved.length - 1].saved_at)}.
          </p>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="View" className="inline-flex rounded-md border border-neutral-300 bg-white p-0.5 text-sm">
              {(["grid", "compare"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`rounded px-3 py-1 font-medium transition ${
                    view === v ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  {v === "grid" ? "Cards" : "Compare"}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="field w-auto py-1" aria-label="Sort saved listings">
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {saved.length > 1 && cheapest && priciest && (
            <p className="mb-4 text-sm text-neutral-700">
              Cheapest: <strong>{formatPrice(cheapest.price)}</strong> ({cheapest.brand} {cheapest.title} on {cheapest.marketplace}) · Range{" "}
              {formatPrice(cheapest.price)}–{formatPrice(priciest.price)}
            </p>
          )}

          {view === "grid" ? (
            <ListingGrid listings={sorted} showNotes />
          ) : (
            <CompareTable listings={sorted} cheapestId={cheapest?.id} />
          )}
        </>
      )}
    </>
  );
}

function CompareTable({ listings, cheapestId }: { listings: SavedListing[]; cheapestId?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th scope="col" className="px-3 py-2">
              Listing
            </th>
            <th scope="col" className="px-3 py-2">
              Price
            </th>
            <th scope="col" className="px-3 py-2">
              Size
            </th>
            <th scope="col" className="px-3 py-2">
              Marketplace
            </th>
            <th scope="col" className="px-3 py-2">
              Saved
            </th>
            <th scope="col" className="w-64 px-3 py-2">
              Your note
            </th>
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {listings.map((l) => {
            const best = l.id === cheapestId && listings.length > 1;
            return (
              <tr key={l.id} className={best ? "bg-green-50" : undefined}>
                <td className="px-3 py-2">
                  <Link href={`/listings/${encodeURIComponent(l.id)}`} className="flex items-center gap-3 hover:underline">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={l.image_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                    <span>
                      <span className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">{l.brand}</span>
                      <span className="font-medium text-neutral-900">{l.title}</span>
                    </span>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold">
                  {formatPrice(l.price)}
                  {best && <span className="ml-2 rounded bg-green-600 px-1.5 py-0.5 text-xs font-medium text-white">Lowest</span>}
                </td>
                <td className="px-3 py-2">{l.size ?? "—"}</td>
                <td className="px-3 py-2">
                  <MarketplaceBadge name={l.marketplace} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-neutral-600" title={l.saved_at}>
                  {formatWhen(l.saved_at)}
                </td>
                <td className="px-3 py-2 align-top">
                  <NoteEditor listing={l} compact />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-3">
                    <a href={l.listing_url} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-xs font-medium text-neutral-700 underline-offset-2 hover:underline">
                      View on {l.marketplace} ↗
                    </a>
                    <SaveButton listing={l} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
