"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { SIZES, type SearchParams } from "@/lib/types";
import { validateSearch, type RawSearchInput } from "@/lib/validate";

type Errors = Partial<Record<keyof RawSearchInput, string>>;

const SIZE_LABELS: Record<string, string> = {
  XS: "XS (Extra small)",
  S: "S (Small)",
  M: "M (Medium)",
  L: "L (Large)",
  XL: "XL (Extra large)",
  XXL: "XXL",
  "One Size": "One size",
};

export function SearchForm({
  initial,
  busy,
  onSearch,
}: {
  initial: SearchParams | null;
  busy: boolean;
  onSearch: (params: SearchParams) => void;
}) {
  const [q, setQ] = useState(initial?.q ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [maxPrice, setMaxPrice] = useState(initial?.maxPrice?.toString() ?? "");
  const [size, setSize] = useState(initial?.size ?? "");
  const [errors, setErrors] = useState<Errors>({});

  // Brand suggestions for the datalist. Best-effort: if this fails the field
  // still works as free text, so there's nothing to show the user.
  const [brands, setBrands] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiFetch<string[]>("/api/brands").then(
      (list) => {
        if (!cancelled) setBrands(list);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateSearch({ q, brand, maxPrice, size });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSearch(result.params);
  };

  const clearFilters = () => {
    setBrand("");
    setMaxPrice("");
    setSize("");
    setErrors({});
  };

  return (
    <form onSubmit={submit} noValidate className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm" aria-label="Search resale listings">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="q" className="sr-only">
            Search term
          </label>
          <input
            id="q"
            name="q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for an item, brand or style — e.g. Chrome Hearts hoodie"
            className="field text-base"
            aria-invalid={!!errors.q}
            aria-describedby={errors.q ? "q-error" : undefined}
            autoFocus
          />
          {errors.q && (
            <p id="q-error" role="alert" className="mt-1 text-sm text-red-700">
              {errors.q}
            </p>
          )}
        </div>
        <button type="submit" disabled={busy} className="btn-primary sm:w-32">
          {busy ? "Searching…" : "Search"}
        </button>
      </div>

      <fieldset className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Optional filters</legend>
        <div>
          <label htmlFor="brand" className="mb-1 block text-sm font-medium">
            Brand
          </label>
          <input
            id="brand"
            name="brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Any brand"
            className="field"
            aria-invalid={!!errors.brand}
            list="brand-suggestions"
            autoComplete="off"
          />
          <datalist id="brand-suggestions">
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          {errors.brand && (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {errors.brand}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="maxPrice" className="mb-1 block text-sm font-medium">
            Maximum price (USD)
          </label>
          <input
            id="maxPrice"
            name="maxPrice"
            type="text"
            inputMode="decimal"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="No limit"
            className="field"
            aria-invalid={!!errors.maxPrice}
            aria-describedby={errors.maxPrice ? "maxPrice-error" : undefined}
          />
          {errors.maxPrice && (
            <p id="maxPrice-error" role="alert" className="mt-1 text-sm text-red-700">
              {errors.maxPrice}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="size" className="mb-1 block text-sm font-medium">
            Size
          </label>
          <select id="size" name="size" value={size} onChange={(e) => setSize(e.target.value)} className="field">
            <option value="">Any size</option>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {SIZE_LABELS[s] ?? s}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      {(brand || maxPrice || size) && (
        <button type="button" onClick={clearFilters} className="mt-3 text-sm text-neutral-600 underline-offset-2 hover:underline">
          Clear filters
        </button>
      )}
    </form>
  );
}
