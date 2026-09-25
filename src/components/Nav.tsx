"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSaved } from "@/components/SavedProvider";

export function Nav() {
  const pathname = usePathname();
  const { saved, status } = useSaved();

  const link = (href: string, label: React.ReactNode) => {
    const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
          current ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-200"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Resale Finder
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          {link("/", "Search")}
          {link(
            "/saved",
            <>
              Saved
              {status === "ready" && saved.length > 0 && (
                <span className="ml-1.5 rounded-full bg-neutral-200 px-1.5 text-xs text-neutral-900">{saved.length}</span>
              )}
            </>,
          )}
        </nav>
      </div>
    </header>
  );
}
