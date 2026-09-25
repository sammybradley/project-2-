# Resale Finder

## Author

Made by Sammy Bradley

## Description

Search resale marketplaces for a specific item, brand or style, then save the
listings you like so you can compare and come back to them. Listings are
practice data (fictional, no real sellers) stored in Supabase; nothing calls a
real marketplace.

**Stack:** Next.js (App Router) · Route Handlers as the backend · Supabase
(Postgres) for storage · Tailwind CSS.

```sh
npm install
npm run dev:mock                   # try it right now, no Supabase needed (see below)

cp .env.local.example .env.local   # then fill in your Supabase values
npm run check:db                   # confirms the tables + seed are in place
npm run dev                        # http://localhost:3000

npm test                           # validation unit tests
npm run test:e2e                   # builds, then drives the real API routes end to end
npm run build                      # production build (also type-checks + lints)
```

### Trying it without Supabase

`npm run dev:mock` starts a small in-memory stand-in for Supabase's REST API
(`scripts/mock-supabase.mjs`, pre-loaded with the same 59 practice listings)
and runs `next dev` against it. Everything works – search, save, remove,
recently viewed – but saved listings only live as long as that process, and the
app shows an amber banner saying so. It exists for development and for the
end-to-end tests; the deployed app uses real Supabase.

---

## Setting up Supabase (once)

1. Create a Supabase project.
2. In **SQL Editor**, run `supabase/schema.sql` (creates the three tables and
   turns on Row Level Security with no policies).
3. Then run `supabase/seed.sql` (inserts the 59 practice listings).
4. In **Project Settings → API**, copy the **Project URL** and the
   **service_role** key into `.env.local`:

   ```
   SUPABASE_URL=https://<your-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key>
   ```
5. `npm run check:db` – it reads `.env.local`, confirms the three tables exist,
   that all 59 listings are loaded, and runs one real search. Each failure
   comes with the step to fix it.

Those two variables are the only configuration. Neither is prefixed with
`NEXT_PUBLIC_`, so Next.js only ever reads them inside the Route Handlers on the
server; the browser never sees the key. Because RLS is on with no policies, the
public anon key can't read or write anything either — only the server can.

### Deploying (Vercel)

Import the repo, add the same two environment variables in the project
settings, deploy. Saved listings live in Supabase, so they survive refreshes,
new tabs and redeploys.

---

## How it works

```
Browser (React client components)
   │  fetch("/api/…")            ← only ever talks to our own Route Handlers
   ▼
Next.js Route Handlers (src/app/api/**)
   │  @supabase/supabase-js with the service-role key (server-only)
   ▼
Supabase Postgres: listings · saved_listings · recently_viewed
```

| Route | What it does |
|---|---|
| `GET /api/search?q=&brand=&size=&maxPrice=&sort=` | Validates the query, then searches `listings`. Every word of the term must match the title, brand or description; brand/size/max price narrow it further. `sort` is `price-asc` (default) or `price-desc`. |
| `GET /api/listings/:id` | One listing (for the detail page). |
| `GET /api/saved` · `POST /api/saved` · `DELETE /api/saved/:id` | This visitor's saved listings. |
| `PATCH /api/saved/:id` `{ note }` | Attach a note (≤ 300 chars) to a saved listing; blank or `null` clears it. 404 if it isn't saved. |
| `GET /api/brands` | Every brand in the practice data, for the brand field's suggestions. |
| `GET /api/recent` · `POST /api/recent` · `DELETE /api/recent` | The 10 most recently *opened* listings that aren't saved; `DELETE` clears the visitor's history. |
| `GET /api/health` | 200 when the database is reachable and seeded, 503 (with the reason) when it isn't. Check it right after deploying. |

**No accounts, but still "my" saved list.** The first time a browser calls the
API, the server sets an anonymous, httpOnly `rf_visitor` cookie (a random UUID)
and keys saved/recently-viewed rows by it. Refreshing or reopening the app in
the same browser keeps the cookie, so the list comes back; a different browser
gets its own list.

**Honest UI.** Every route answers `{ ok: true, data }` or
`{ ok: false, error }` with a real HTTP status and `Cache-Control: no-store`. The client never updates
optimistically — a card only flips to "Saved" after the server confirms — so a
backend failure shows an error message instead of pretending it worked.

### Where things live

```
src/app/page.tsx               Search page (form + results + Recently viewed)
src/app/saved/page.tsx         Saved page (cards or a side-by-side compare table)
src/app/error.tsx              Error boundary for anything that throws while rendering
src/app/listings/[id]/page.tsx Listing detail (records the visit, links to the marketplace)
src/app/api/**                 Route Handlers (the backend)
src/lib/validate.ts            Search validation, shared by the form and the API
src/lib/server/listings.ts     All Supabase queries
src/lib/server/api.ts          Response envelope, error handling, visitor cookie
src/components/SavedProvider.tsx  One source of truth for saved listings (and their notes) on the client
src/components/NoteEditor.tsx  Click-to-edit note on a saved listing
data/listings.json             The practice listings (edit these, then `npm run generate:seed`)
supabase/schema.sql            Tables + RLS
supabase/seed.sql              Generated INSERTs for the practice listings
public/images/*.svg            Generated placeholder images (no external image hosts)
scripts/lib/listing-rows.mjs   listings.json → table rows (shared by the seed generator and the mock)
scripts/mock-supabase.mjs      In-memory PostgREST look-alike for dev:mock and the e2e tests
scripts/check-supabase.mjs     `npm run check:db`
test/validate.test.mts         Unit tests for the validation rules
test/e2e/api.e2e.test.mts      End-to-end tests of the Route Handlers
```

---

## Acceptance criteria → where to look

| Criterion | How it's met |
|---|---|
| Open the app and search for an item or brand | Search form is the home page; the term is the only required field. |
| "Chrome Hearts hoodie" returns relevant listings | Each word must match title/brand/description, so the Chrome Hearts hoodies match and unrelated hoodies don't. |
| Brand = Chrome Hearts, Size = Medium, Max = $300 narrows results | Brand is a case-insensitive contains match, size an exact (case-insensitive) match, price `<=`. Active filters are shown as chips above the results. |
| Blank search term rejected | Rejected in the form *and* by `/api/search` (HTTP 400). |
| Negative / invalid max price rejected | Same — "-5", "abc", "12.345", "1e3" all rejected with a specific message. |
| Each result shows its marketplace | Colored marketplace badge on every card, plus "View on ‹marketplace›". |
| Clicking a listing gives a way to view the original | Card → detail page with "View original on ‹marketplace›"; cards also carry a direct link. |
| Saving shows it in Saved | Save button on every card and the detail page; the nav shows a live count. |
| Saved listings survive a refresh | Stored in Supabase, keyed by the visitor cookie. |
| Removing a saved item removes it from Saved | "Remove" on any saved card. |
| Backend errors aren't hidden | Errors from search, loading saved/recent, saving and removing each show a message with "Try again"; nothing is updated until the server confirms. |
| Usable at laptop and phone widths | One column under 640 px, two from 640 px, three from 1024 px, four from 1280 px; the form stacks on phones. |

Also: opening a listing records it, and the Recently viewed section on the home
page shows the 10 most recent *unsaved* ones (saving a listing drops it from
that list; the server trims anything past 10). "Clear history" empties it.

**Comparing.** The Saved page has a Compare view: one row per saved listing
with price, size, marketplace and your note side by side, the lowest price
highlighted, and sorting by price, brand or marketplace. Notes ("ask about the
pilling", "cheaper on Depop?") are stored in Supabase with the saved row, so
they come back after a refresh too. Search results can be sorted by price in
either direction and narrowed to one marketplace with the chips above the
grid; the brand field suggests every brand in the data as you type.

## Tests

`npm test` runs the validation rules (blank terms, bad prices, normalisation,
URL round-trip) with Node's built-in test runner.

`npm run test:e2e` builds the app, starts it with `next start` against the
in-memory mock database, and walks the acceptance criteria over real HTTP:
the "Chrome Hearts hoodie" search, the brand/size/price filters, blank-term and
bad-price rejection (HTTP 400), marketplace + original link on every result,
save → refresh → still saved → remove (with the visitor cookie, and a second
"browser" that can't see the first one's list), the 10-item recently-viewed
cap, and a simulated database outage where every route must answer
`{ ok: false }` with a 500 instead of pretending. `npm run test:all` runs both.

`npm run build` type-checks and lints the whole app.
