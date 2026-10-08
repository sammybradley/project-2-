# Resale Finder

## Author

Made by Sammy Bradley

## Description

Search resale marketplaces for a specific item, brand or style, then save the
listings you like so you can compare and come back to them. Listings are
practice data (fictional, no real sellers); nothing calls a real marketplace.

The project is two apps in one repo:

| Folder | What it is | Runs on |
|---|---|---|
| `/` (this folder) | **Frontend** – Next.js App Router pages and React components. It has no data of its own: every screen fetches from `/api/…`. | http://localhost:3000 |
| `backend/` | **Backend** – Next.js Route Handlers over a **Supabase (Postgres) database**. No pages. Prints every request it receives with its status code. Falls back to an in-memory store when no Supabase credentials are set. | http://localhost:4000 |

The frontend's `next.config.ts` forwards every `/api/*` request to the backend
(`BACKEND_URL`, default `http://localhost:4000`), so the browser only ever
talks to the frontend's origin and the visitor cookie passes straight through.

```sh
npm install            # installs the frontend and (via postinstall) the backend
npm run dev            # backend + frontend together in one terminal
                       #   → open http://localhost:3000

npm test               # frontend unit tests (search validation)
npm run test:backend   # backend API tests over HTTP (25 tests)
npm run test:integration   # starts both apps and checks the frontend really reaches the backend
npm run test:all       # all three

npm run build          # production build of the frontend (type-checks + lints)
npm run generate:listings   # rebuild backend/data/listings.json + public/images from the seed + catalogue
```

Prefer separate terminals? `npm run dev:backend` in one, `npm run dev:web` in
another. The backend can also be run and tested entirely on its own – see
[`backend/README.md`](backend/README.md) for its endpoints and `curl` commands.

### Watching requests

With `npm run dev` running, every request the frontend makes shows up in the
backend's log with its status code:

```
[backend] 11:40:38  GET    /api/search?q=Chrome+Hearts+hoodie  200  3 ms
[backend] 11:40:41  POST   /api/saved  201  8 ms
[backend] 11:40:52  GET    /api/search?q=  400  1 ms
```

In the browser, right-click → Inspect → **Network** shows the same requests
leaving the page (`/api/search`, `/api/saved`, …). 200 or 201 means success;
400s are rejected input; 500s mean the backend failed.

---

## How it works

```
Browser (React client components)
   │  fetch("/api/…")                        ← relative URLs, same origin
   ▼
Frontend  next.config.ts  rewrites /api/:path*  →  BACKEND_URL/api/:path*
   │  (cookies, bodies and status codes pass through untouched)
   ▼
Backend   Route Handlers (backend/src/app/api/**)
   │
   ▼
Store (backend/src/lib/store.ts) → Supabase Postgres: listings · saved · recently viewed
          (backend/src/lib/store-supabase.ts; store-memory.ts when Supabase isn't configured)
```

| Route | What it does |
|---|---|
| `GET /api/search?q=&brand=&size=&maxPrice=&sort=` | Validates the query, then searches. Every word of the term (or a synonym: "sweatshirt" finds hoodies, "sneakers" finds shoes) must match the title, brand or description; brand/size/max price narrow it further. If nothing matches every word, the closest listings come back marked `partial` and the page says so. `sort` is `price-asc` (default) or `price-desc`. |
| `GET /api/listings/:id` | One listing (for the detail page). |
| `GET /api/saved` · `POST /api/saved` · `DELETE /api/saved/:id` | This visitor's saved listings. |
| `PATCH /api/saved/:id` `{ note }` | Attach a note (≤ 300 chars) to a saved listing; blank or `null` clears it. 404 if it isn't saved. |
| `GET /api/brands` | Every brand in the practice data, for the brand field's suggestions. |
| `GET /api/recent` · `POST /api/recent` · `DELETE /api/recent` | The 10 most recently *opened* listings that aren't saved; `DELETE` clears the visitor's history. |
| `GET /api/health` | 200 when the backend and its store are up (with which store it is and a live row count), 503 (with the reason) when they aren't. |
| `GET /api/session` | What the database holds for this browser: the visitor id prefix, how many saved and recently-viewed rows it has, and which store is running. The strip under the nav shows this. |

**No accounts, but still "my" saved list.** The first time a browser calls the
API, the backend sets an anonymous, httpOnly `rf_visitor` cookie (a random UUID)
and keys saved/recently-viewed rows by it. Refreshing or reopening the app in
the same browser keeps the cookie, so the list comes back; a different browser
gets its own list.

**Storage.** The backend stores everything in a Supabase Postgres database
(`backend/supabase/schema.sql`: tables `listings`, `saved`, `recent`). The
practice listings (about 400 fictional ones across 59 brands) are generated
into `backend/data/listings.json` and loaded into the `listings` table with
`npm run seed:supabase`; saved and recently-viewed rows are written to the
database on every save / view, keyed by the visitor cookie, so they survive
refreshes, new tabs, backend restarts and redeploys. The hand-written listings
live in `backend/data/listings.seed.json`; `npm run generate:listings` adds the
generated ones and writes a placeholder image per listing into `public/images`.
Only the backend holds the Supabase secret key (`backend/.env.local` locally,
the Vercel project's environment variables when deployed); the browser never
talks to Supabase. Without those credentials the backend runs an in-memory
store with the same interface (`backend/src/lib/store-memory.ts`), which the
UI flags in amber.

**Showing that it's really the database.** The strip under the navigation bar
asks `GET /api/session` on every page load and again after every save or
remove, and prints the answer: which store is running, how many listings it
holds, and how many saved / recently-viewed rows exist for this browser's
visitor id. Every saved card and the compare table show the `saved_at`
timestamp the database wrote, and the Saved page says how many rows it just
loaded. None of those numbers are kept in the page or in browser storage – the
frontend has no state of its own beyond what it last fetched.

**Honest UI.** Every route answers `{ ok: true, data }` or
`{ ok: false, error }` with a real HTTP status and `Cache-Control: no-store`. The
client never updates optimistically – a card only flips to "Saved" after the
backend confirms – so a backend failure shows an error message instead of
pretending it worked.

### Where things live

```
src/app/page.tsx               Search page (form + results + Recently viewed)
src/app/saved/page.tsx         Saved page (cards or a side-by-side compare table)
src/app/error.tsx              Error boundary for anything that throws while rendering
src/app/listings/[id]/page.tsx Listing detail (records the visit, links to the marketplace)
src/lib/client/api.ts          The one fetch wrapper: unwraps the envelope, turns failures into errors
src/lib/validate.ts            Search validation for instant feedback in the form (the backend re-checks)
src/lib/types.ts               Shapes on the wire (the backend has an identical copy)
src/components/SavedProvider.tsx  One source of truth for saved listings (and their notes) on the client
src/components/NoteEditor.tsx  Click-to-edit note on a saved listing
public/images/*.svg            Placeholder images the backend's image_url values point at
next.config.ts                 The /api/* → backend rewrite
scripts/dev.mjs                `npm run dev`: runs backend + frontend together
scripts/generate-listings.mjs  Practice-data generator (listings + placeholder images)
test/validate.test.mts         Unit tests for the validation rules
test/integration/frontend-backend.test.mts  Frontend ↔ backend integration test

backend/                       The API – see backend/README.md
```

### Deploying (Vercel)

The app runs as two Vercel projects from this one repository:

| Vercel project | Root directory | Environment variables |
|---|---|---|
| `resale-finder-api` (backend) | `backend` | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (secret, server-side only) |
| `resale-finder` (frontend) | `.` | `BACKEND_URL=https://<backend project>.vercel.app` |

The frontend's `/api/*` rewrite proxies to the backend server-side, so the
browser only ever sees the frontend's origin and the `rf_visitor` cookie works
unchanged. With the Vercel CLI (`npx vercel`), from `backend/`: `vercel link`,
`vercel env add SUPABASE_URL production`, `vercel env add SUPABASE_SECRET_KEY production`,
`vercel deploy --prod`; then from the root: `vercel link`,
`vercel env add BACKEND_URL production`, `vercel deploy --prod`. The database
itself is set up once: run `backend/supabase/schema.sql` in the Supabase SQL
Editor and `npm run seed:supabase` in `backend/` (see `backend/README.md`).

---

## Acceptance criteria → where to look

| Criterion | How it's met |
|---|---|
| Open the app and search for an item or brand | Search form is the home page; the term is the only required field. |
| "Chrome Hearts hoodie" returns relevant listings | Each word must match title/brand/description, so the Chrome Hearts hoodies match and unrelated hoodies don't. |
| Brand = Chrome Hearts, Size = Medium, Max = $300 narrows results | Brand is a case-insensitive contains match, size an exact (case-insensitive) match, price `<=`. Active filters are shown as chips above the results. |
| Blank search term rejected | Rejected in the form *and* by `/api/search` (HTTP 400). |
| Negative / invalid max price rejected | Same – "-5", "abc", "12.345", "1e3" all rejected with a specific message. |
| Each result shows its marketplace | Coloured marketplace badge on every card, plus "View on ‹marketplace›". |
| Clicking a listing gives a way to view the original | Card → detail page with "View original on ‹marketplace›"; cards also carry a direct link. |
| Saving shows it in Saved | Save button on every card and the detail page; the nav shows a live count. |
| Saved listings survive a refresh | Stored by the backend, keyed by the visitor cookie. |
| Removing a saved item removes it from Saved | "Remove" on any saved card. |
| Backend errors aren't hidden | Errors from search, loading saved/recent, saving and removing each show a message with "Try again"; nothing is updated until the backend confirms. |
| Usable at laptop and phone widths | One column under 640 px, two from 640 px, three from 1024 px, four from 1280 px; the form stacks on phones. |

Also: opening a listing records it, and the Recently viewed section on the home
page shows the 10 most recent *unsaved* ones (saving a listing drops it from
that list; the backend trims anything past 10). "Clear history" empties it.

**Comparing.** The Saved page has a Compare view: one row per saved listing
with price, size, marketplace and your note side by side, the lowest price
highlighted, and sorting by price, brand or marketplace. Notes ("ask about the
pilling", "cheaper on Depop?") are stored with the saved row, so they come back
after a refresh too. Search results can be sorted by price in either direction
and narrowed to one marketplace with the chips above the grid; the brand field
suggests every brand in the data as you type.

## Tests

`npm test` runs the frontend's validation rules (blank terms, bad prices,
normalisation) with Node's built-in test runner.

`npm run test:backend` runs the backend's 27 tests over real HTTP: the
"Chrome Hearts hoodie" search, synonyms and partial matches, the brand/size/price filters, blank-term and
bad-price rejection (HTTP 400), marketplace + original link on every result,
save → refresh → still saved → remove (with the visitor cookie, and a second
"browser" that can't see the first one's list), notes, the 10-item
recently-viewed cap, JSON 404s, and a simulated outage where every route must
answer `{ ok: false }` with a 500 instead of pretending. It uses the backend
you already have running on port 4000, or starts its own.

`npm run test:integration` starts a backend and a frontend on spare ports and
checks that the frontend's `/api/*` really reaches the backend: health through
the proxy, a 400 passing through, the visitor cookie round-tripping so a save
made through the frontend shows up in the backend's store, the page rendering
with no mock data, and a 5xx (not a fake success) when the backend is down.
If `npm run dev` is already running it tests those servers (and skips the
"backend down" case, since it can't stop a server it didn't start).

`npm run test:all` runs all three. `npm run build` type-checks and lints the
frontend.
