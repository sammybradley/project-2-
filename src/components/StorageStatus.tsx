"use client";

import { useCallback, useEffect, useState } from "react";
import { useSaved } from "@/components/SavedProvider";
import { apiFetch } from "@/lib/client/api";
import type { Session } from "@/lib/types";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; session: Session };

/**
 * The strip under the navigation bar that says where the data lives. It asks
 * the backend (GET /api/session) and shows the answer verbatim: which store is
 * running, how many listings it holds, and how many rows it has for this
 * browser's visitor id. It re-asks after every save / remove, so the numbers
 * you see are always what the database just confirmed – nothing here is
 * computed from page state.
 */
export function StorageStatus() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const { saved } = useSaved();

  const load = useCallback(async () => {
    try {
      const session = await apiFetch<Session>("/api/session", { cache: "no-store" });
      setState({ kind: "ready", session });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Could not reach the backend." });
    }
  }, []);

  // On load, and again whenever the saved list changes (a save, remove or note).
  useEffect(() => {
    void load();
  }, [load, saved]);

  if (state.kind === "loading") {
    return (
      <Strip tone="neutral">
        <Dot className="bg-neutral-400" /> Checking the database…
      </Strip>
    );
  }
  if (state.kind === "error") {
    return (
      <Strip tone="red">
        <Dot className="bg-red-500" /> Database unreachable: {state.message}
      </Strip>
    );
  }

  const { session } = state;
  const { store } = session;
  if (!store.persistent) {
    return (
      <Strip tone="amber">
        <Dot className="bg-amber-500" />
        <span>
          <strong>In-memory store</strong> (no database configured): {store.listings} listings, but anything you save is lost when the
          server restarts.
        </span>
      </Strip>
    );
  }
  return (
    <Strip tone="green">
      <Dot className="bg-green-500" />
      <span>
        <strong>Connected to the Supabase database</strong> · {store.listings} listings · stored under visitor{" "}
        <code className="rounded bg-white/70 px-1 font-mono text-[11px]">{session.visitor}…</code>:{" "}
        <strong>{session.savedCount}</strong> saved, <strong>{session.recentCount}</strong> recently viewed. These rows live in the
        database, so they&apos;re still here after a refresh, in a new tab, or when you come back later.
      </span>
    </Strip>
  );
}

const TONES = {
  neutral: "border-neutral-200 bg-neutral-50 text-neutral-600",
  green: "border-green-200 bg-green-50 text-green-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  red: "border-red-200 bg-red-50 text-red-800",
} as const;

function Strip({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" className={`border-b text-xs ${TONES[tone]}`}>
      <div className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-1.5">{children}</div>
    </div>
  );
}

function Dot({ className }: { className: string }) {
  return <span aria-hidden className={`mt-1 h-2 w-2 shrink-0 rounded-full ${className}`} />;
}
