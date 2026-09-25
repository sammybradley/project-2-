import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { SavedProvider } from "@/components/SavedProvider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Resale Finder", template: "%s · Resale Finder" },
  description: "Search resale marketplaces for clothing, brands and styles, and save the listings you like.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Set by `npm run dev:mock`: the app is talking to the in-memory mock database,
// so say so rather than let a demo look like real persistence.
const usingMock = process.env.NEXT_PUBLIC_MOCK_SUPABASE === "1";

export default function RootLayout({ children }: LayoutProps<"/">) {
  // suppressHydrationWarning on <body>: browser extensions (e.g. Grammarly) inject attributes there.
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <SavedProvider>
          <Nav />
          {usingMock && (
            <p role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900">
              Running on the local mock database (<code>npm run dev:mock</code>) — saved listings reset when the dev
              server stops. Configure Supabase for real persistence.
            </p>
          )}
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
          <footer className="border-t border-neutral-200 py-4 text-center text-xs text-neutral-500">
            Practice data only — listings are fictional. Intro to AI, Project 2.
          </footer>
        </SavedProvider>
      </body>
    </html>
  );
}
