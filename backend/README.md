# Resale Finder – backend

The API for Resale Finder, on its own: Next.js Route Handlers with an
in-memory store. It has no pages and talks to no database. The practice
listings (about 400, all fictional) come from `data/listings.json`; saved and
recently-viewed rows live in memory, so they survive page refreshes but reset
when the server restarts.

`data/listings.seed.json` holds the hand-written listings; the rest are
generated from a catalogue of brands and items by `npm run generate:listings`
in the project root, which rewrites `data/listings.json` and the placeholder
images the frontend serves.

```sh
npm install
npm run dev        # http://localhost:4000 – every request is printed with its status code
npm test           # automated tests over HTTP (uses the running server, or starts its own)
npm run build      # production build (type-checks)
```

While `npm run dev` is running, each request shows up in that terminal like

```
11:40:38  POST   /api/saved  201  8 ms
11:40:39  GET    /api/search?q=  400  1 ms
```

200/201 = success, 400s = the caller's mistake, 500s = the server failed.

## Endpoints

Every route answers `{ "ok": true, "data": … }` or `{ "ok": false, "error": "…" }`
with a real HTTP status and `Cache-Control: no-store`.

| Route | What it does |
|---|---|
| `GET /` · `GET /api` | Lists the endpoints. |
| `GET /api/health` | 200 with the listing count; 503 when the store can't answer. |
| `GET /api/search?q=&brand=&size=&maxPrice=&sort=` | Search. Answers `{ listings, match }`. `q` is required; every word (or a synonym – "sweatshirt" finds hoodies, "sneakers" finds shoes, "gray" finds grey) must match the title, brand or description. If nothing matches every word, the closest listings come back with `match: "partial"` (most matching words first). `brand` is a contains match, `size` exact, `maxPrice` an upper bound, `sort` is `price-asc` (default) or `price-desc`. Bad input → 400. |
| `GET /api/listings/:id` | One listing; 404 if unknown. |
| `GET /api/brands` | Every brand in the data, A–Z. |
| `GET /api/saved` · `POST /api/saved {listingId}` · `DELETE /api/saved/:id` | This visitor's saved listings (POST answers 201). |
| `PATCH /api/saved/:id {note}` | Attach a note (≤ 300 chars) to a saved listing; blank or `null` clears it. 404 if it isn't saved. |
| `GET /api/recent` · `POST /api/recent {listingId}` · `DELETE /api/recent` | The 10 most recently *opened* listings that aren't saved; DELETE clears the history. |
| `POST /api/dev/outage {on}` | Development only: `true` makes every route fail (500 / 503), `false` recovers. Gone in a production build. |

There are no accounts. The first request from a client gets an anonymous,
httpOnly `rf_visitor` cookie, and saved / recently-viewed rows are keyed by it.

## Try it from another terminal

```sh
curl -i http://localhost:4000/api/health
curl -s "http://localhost:4000/api/search?q=Chrome%20Hearts%20hoodie" | python3 -m json.tool
curl -s "http://localhost:4000/api/search?q=hoodie&brand=Chrome%20Hearts&size=M&maxPrice=300" | python3 -m json.tool
curl -i "http://localhost:4000/api/search?q="                       # 400: blank search term
curl -i "http://localhost:4000/api/search?q=hoodie&maxPrice=-5"     # 400: negative price

# Save, list, note, remove – `-c`/`-b` keep the visitor cookie between calls like a browser would.
curl -i -c cookies.txt -X POST http://localhost:4000/api/saved -H "Content-Type: application/json" -d '{"listingId":"ch-001"}'
curl -s -b cookies.txt http://localhost:4000/api/saved | python3 -m json.tool
curl -s -b cookies.txt -X PATCH http://localhost:4000/api/saved/ch-001 -H "Content-Type: application/json" -d '{"note":"ask about the pilling"}'
curl -i -b cookies.txt -X DELETE http://localhost:4000/api/saved/ch-001

# Recently viewed
curl -s -b cookies.txt -X POST http://localhost:4000/api/recent -H "Content-Type: application/json" -d '{"listingId":"ch-002"}'
curl -s -b cookies.txt http://localhost:4000/api/recent | python3 -m json.tool

# Errors: unknown listing (404), then a simulated outage (500 / 503) and recovery
curl -i http://localhost:4000/api/listings/nope
curl -s -X POST http://localhost:4000/api/dev/outage -H "Content-Type: application/json" -d '{"on":true}'
curl -i "http://localhost:4000/api/search?q=hoodie"
curl -s -X POST http://localhost:4000/api/dev/outage -H "Content-Type: application/json" -d '{"on":false}'
```

## Where things live

```
src/app/route.ts, src/app/api/route.ts   GET / and GET /api (endpoint index)
src/app/api/**/route.ts                  The Route Handlers
src/app/api/[...rest]/route.ts           JSON 404 for unknown /api paths
src/lib/api.ts                           Response envelope, error handling, request log, visitor cookie
src/lib/store.ts                         All data access (in-memory), search synonyms + fallback; swap this file for a database later
src/lib/listings-data.ts                 data/listings.json → Listing rows (adds image_url and listing_url)
src/lib/validate.ts                      Search validation (blank term, bad price, unknown sort)
test/api.test.mts                        Tests over HTTP: acceptance criteria, synonyms, partial matches, cookie, errors, outage
../scripts/generate-listings.mjs         Builds data/listings.json (+ images) from data/listings.seed.json and a catalogue
test/validate.test.mts                   Unit tests for the validation rules
```
