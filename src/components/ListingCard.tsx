"use client";

import Link from "next/link";
import { NoteEditor } from "@/components/NoteEditor";
import { SaveButton } from "@/components/SaveButton";
import { useSaved } from "@/components/SavedProvider";
import { MarketplaceBadge, formatPrice, formatWhen } from "@/components/ui";
import { recordView } from "@/lib/client/api";
import type { Listing, SavedListing } from "@/lib/types";

const isSavedListing = (l: Listing): l is SavedListing => "note" in l;

/**
 * One listing in a grid. The whole card links to the in-app listing page (which
 * records the visit and links out to the marketplace); the footer holds Save and
 * a direct "View on <marketplace>" link. Cards on the Saved page also carry the
 * visitor's note.
 */
export function ListingCard({ listing, showNote = false }: { listing: Listing; showNote?: boolean }) {
  const { isSaved } = useSaved();
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition hover:shadow-md">
      <Link href={`/listings/${encodeURIComponent(listing.id)}`} className="group block">
        <div className="relative aspect-square bg-neutral-100">
          {/* Plain <img>: the images are static SVGs in /public, no optimisation needed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={listing.image_url}
            alt={`${listing.brand} ${listing.title}`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <MarketplaceBadge name={listing.marketplace} className="absolute left-2 top-2 shadow" />
          {isSaved(listing.id) && (
            <span className="absolute right-2 top-2 rounded bg-white/95 px-2 py-0.5 text-xs font-semibold text-neutral-900 shadow">
              ♥ Saved
            </span>
          )}
        </div>
        <div className="p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{listing.brand}</p>
          <h3 className="mt-0.5 line-clamp-2 text-sm font-medium text-neutral-900 group-hover:underline">
            {listing.title}
          </h3>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-base font-semibold">{formatPrice(listing.price)}</span>
            <span className="text-xs text-neutral-600">Size {listing.size ?? "—"}</span>
          </div>
        </div>
      </Link>
      {showNote && isSavedListing(listing) && (
        <div className="border-t border-neutral-100 px-3 py-2">
          <p className="mb-1 text-[11px] text-neutral-500" title={listing.saved_at}>
            Saved to the database {formatWhen(listing.saved_at)}
          </p>
          <NoteEditor listing={listing} compact />
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-neutral-100 px-3 py-2">
        <SaveButton listing={listing} />
        <a
          href={listing.listing_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => void recordView(listing.id).catch(() => {})}
          className="text-xs font-medium text-neutral-700 underline-offset-2 hover:underline"
        >
          View on {listing.marketplace} ↗
        </a>
      </div>
    </article>
  );
}

export function ListingGrid({ listings, showNotes = false }: { listings: Listing[]; showNotes?: boolean }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {listings.map((l) => (
        <li key={l.id}>
          <ListingCard listing={l} showNote={showNotes} />
        </li>
      ))}
    </ul>
  );
}
