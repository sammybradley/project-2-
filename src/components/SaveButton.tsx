"use client";

import { useState } from "react";
import { useSaved } from "@/components/SavedProvider";
import type { Listing } from "@/lib/types";

/**
 * Save / Remove toggle for one listing. Shows the request in flight and surfaces
 * the server's error inline instead of silently flipping state.
 */
export function SaveButton({ listing, size = "sm" }: { listing: Listing; size?: "sm" | "lg" }) {
  const { status, isSaved, pending, save, remove } = useSaved();
  const [error, setError] = useState<string | null>(null);

  const saved = isSaved(listing.id);
  const busy = pending.has(listing.id);
  // Until we know what's saved, don't let the user double-save or mis-remove.
  const disabled = busy || status === "loading";

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    try {
      if (saved) await remove(listing.id);
      else await save(listing);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  const cls = `${saved ? "btn-secondary" : "btn-primary"} ${size === "lg" ? "px-5 py-2.5 text-base" : ""}`;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={saved}
        title={saved ? "Remove from saved" : "Save this listing"}
        className={`${cls} whitespace-nowrap`}
      >
        {busy ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            {saved ? "Removing…" : "Saving…"}
          </>
        ) : saved ? (
          <>
            <span aria-hidden>♥</span> Remove
          </>
        ) : (
          <>
            <span aria-hidden>♡</span> Save
          </>
        )}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {saved ? "Couldn't remove: " : "Couldn't save: "}
          {error}
        </p>
      )}
    </div>
  );
}
