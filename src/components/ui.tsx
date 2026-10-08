"use client";

/** Small shared pieces: loading, error and empty states, marketplace badge, price. */

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-md border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-600">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorBanner({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-danger mt-3">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-md border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-600">
      <p className="font-medium text-neutral-800">{title}</p>
      {hint && <p className="mt-1">{hint}</p>}
    </div>
  );
}

const MARKETPLACE_COLORS: Record<string, string> = {
  Grailed: "bg-black text-white",
  Depop: "bg-red-600 text-white",
  eBay: "bg-blue-600 text-white",
  Poshmark: "bg-rose-700 text-white",
  Vinted: "bg-teal-600 text-white",
  Mercari: "bg-orange-500 text-white",
};

export function MarketplaceBadge({ name, className = "" }: { name: string; className?: string }) {
  const color = MARKETPLACE_COLORS[name] ?? "bg-neutral-700 text-white";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold tracking-wide ${color} ${className}`}>
      {name}
    </span>
  );
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
export const formatPrice = (n: number) => usd.format(n);

const when = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
/** "Oct 7, 2026, 3:12 PM" from an ISO timestamp (what the store returns in saved_at). */
export const formatWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : when.format(d);
};
