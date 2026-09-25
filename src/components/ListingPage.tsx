"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SaveButton } from "@/components/SaveButton";
import { ErrorBanner, MarketplaceBadge, Spinner, formatPrice } from "@/components/ui";
import { apiFetch, recordView } from "@/lib/client/api";
import type { Listing } from "@/lib/types";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; listing: Listing };

/**
 * Detail page for one listing. Opening it counts as a "visit" for the
 * Recently viewed section, and it links out to the original marketplace listing.
 */
export function ListingPage({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const router = useRouter();
  // Came here from inside the app (search results, Saved)? Go back to exactly
  // that page – filters and all. Landed directly? The link's href takes you home.
  const back = (e: React.MouseEvent) => {
    const cameFromApp = document.referrer !== "" && new URL(document.referrer).origin === window.location.origin;
    if (!cameFromApp) return;
    e.preventDefault();
    router.back();
  };

  const [loadCount, setLoadCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    apiFetch<Listing>(`/api/listings/${encodeURIComponent(id)}`, { cache: "no-store" }).then(
      (listing) => {
        if (cancelled) return;
        setState({ kind: "ready", listing });
        // Recording the visit is best-effort; it shouldn't block or break the page.
        recordView(listing.id).catch(() => {});
      },
      (err: unknown) => {
        if (cancelled) return;
        setState({ kind: "error", message: err instanceof Error ? err.message : "Could not load listing." });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, loadCount]);

  const load = () => {
    setState({ kind: "loading" });
    setLoadCount((c) => c + 1);
  };

  if (state.kind === "loading") return <Spinner label="Loading listing…" />;
  if (state.kind === "error") {
    return (
      <div className="space-y-4">
        <ErrorBanner title="Couldn't load this listing" message={state.message} onRetry={load} />
        <Link href="/" onClick={back} className="btn-secondary">
          ← Back to search
        </Link>
      </div>
    );
  }

  const { listing } = state;
  return (
    <article className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={listing.image_url} alt={`${listing.brand} ${listing.title}`} className="aspect-square w-full object-cover" />
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <MarketplaceBadge name={listing.marketplace} />
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">{listing.brand}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{listing.title}</h1>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-neutral-200 bg-white p-4 text-sm">
          <dt className="text-neutral-500">Price</dt>
          <dd className="text-lg font-semibold">{formatPrice(listing.price)}</dd>
          <dt className="text-neutral-500">Size</dt>
          <dd>{listing.size ?? "Not listed"}</dd>
          <dt className="text-neutral-500">Brand</dt>
          <dd>{listing.brand}</dd>
          <dt className="text-neutral-500">Marketplace</dt>
          <dd>{listing.marketplace}</dd>
        </dl>

        {listing.description && <p className="text-sm leading-relaxed text-neutral-700">{listing.description}</p>}

        <div className="flex flex-wrap items-start gap-3">
          <SaveButton listing={listing} size="lg" />
          <a href={listing.listing_url} target="_blank" rel="noopener noreferrer" className="btn-secondary px-5 py-2.5 text-base">
            View original on {listing.marketplace} ↗
          </a>
        </div>

        <Link href="/" onClick={back} className="text-sm text-neutral-600 underline-offset-2 hover:underline">
          ← Back to search
        </Link>
      </div>
    </article>
  );
}
