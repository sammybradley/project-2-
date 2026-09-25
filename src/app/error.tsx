"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Catches anything that throws while rendering a page (not API errors – those
 * are handled inline) and shows a way out instead of a blank screen.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-neutral-600">The page hit an unexpected error. Nothing was saved or changed.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-secondary">
          Back to search
        </Link>
      </div>
    </div>
  );
}
