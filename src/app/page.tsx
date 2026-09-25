import { Suspense } from "react";
import { SearchPage } from "@/components/SearchPage";
import { Spinner } from "@/components/ui";

export default function Home() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Find it on resale</h1>
      {/* useSearchParams needs a Suspense boundary for the static shell. */}
      <Suspense fallback={<Spinner label="Loading search…" />}>
        <SearchPage />
      </Suspense>
    </>
  );
}
