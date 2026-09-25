"use client";

import { useState } from "react";
import { useSaved } from "@/components/SavedProvider";
import { MAX_NOTE_LENGTH, type SavedListing } from "@/lib/types";

/**
 * The visitor's note on a saved listing ("ask about the pilling", "cheaper on
 * Depop?"). Click to edit; saves on Enter/blur, Escape cancels. The text only
 * updates once the server has stored it.
 */
export function NoteEditor({ listing, compact = false }: { listing: SavedListing; compact?: boolean }) {
  const { setNote } = useSaved();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(listing.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setDraft(listing.note ?? "");
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const commit = async () => {
    const next = draft.trim();
    if (next === (listing.note ?? "")) return cancel();
    setBusy(true);
    setError(null);
    try {
      await setNote(listing.id, next || null);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the note.");
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={start}
        className={`block max-w-full text-left underline-offset-2 hover:underline ${
          listing.note ? "text-neutral-800" : "text-neutral-500"
        } ${compact ? "text-xs" : "text-sm"}`}
        title={listing.note ? "Edit note" : "Add a note"}
      >
        {listing.note ? (
          <>
            <span aria-hidden>✎</span> {listing.note}
          </>
        ) : (
          <>
            <span aria-hidden>+</span> Add note
          </>
        )}
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <input
        autoFocus
        value={draft}
        maxLength={MAX_NOTE_LENGTH}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        placeholder="e.g. ask seller about pilling"
        aria-label={`Note for ${listing.title}`}
        className={`field ${compact ? "py-1 text-xs" : ""}`}
      />
      <p className="text-xs text-neutral-500">
        {busy ? "Saving…" : "Enter to save · Esc to cancel"}
      </p>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          Couldn&apos;t save note: {error}
        </p>
      )}
    </div>
  );
}
