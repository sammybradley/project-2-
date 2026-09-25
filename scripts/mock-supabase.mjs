// A tiny in-memory stand-in for Supabase's REST API (PostgREST), just big enough
// for the queries in src/lib/server/listings.ts. It lets you run and test the
// whole app *before* a real Supabase project exists:
//
//   npm run dev:mock     – starts this + `next dev` pointed at it
//   npm run test:e2e     – drives the real Route Handlers through it
//
// It speaks the same URL grammar supabase-js sends (?col=ilike.%x%, ?or=(...),
// ?order=price.asc, Prefer: resolution=merge-duplicates …) and enforces the same
// foreign keys as supabase/schema.sql, so the app code is exercised unchanged.
// Nothing is persisted: restart the server and saved/recent rows are gone.
// Real Supabase is what the deployed app uses (see README).

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { loadListingRows } from "./lib/listing-rows.mjs";

/* ---------- schema ---------- */

const SCHEMA = {
  listings: { pk: ["id"], defaults: () => ({ created_at: new Date().toISOString() }) },
  saved_listings: {
    pk: ["visitor_id", "listing_id"],
    fk: { listing_id: "listings" },
    defaults: () => ({ saved_at: new Date().toISOString() }),
  },
  recently_viewed: {
    pk: ["visitor_id", "listing_id"],
    fk: { listing_id: "listings" },
    defaults: () => ({ viewed_at: new Date().toISOString() }),
  },
};

// Embedded resources: `listing:listings (cols)` joins through this column.
const EMBED_FK = { listings: "listing_id" };

/* ---------- filter grammar ---------- */

// PostgREST wildcards (% and *, _) → RegExp. Case-insensitive for ilike.
function likeToRegExp(pattern, flags) {
  const src = pattern
    .split("")
    .map((c) => (c === "%" || c === "*" ? ".*" : c === "_" ? "." : c.replace(/[.+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${src}$`, flags);
}

const num = (v) => (typeof v === "number" ? v : v !== null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);

function compare(a, b) {
  const na = num(a);
  const nb = num(b);
  if (na !== null && nb !== null) return na - nb;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function unquote(s) {
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}

// Splits on top-level commas, honouring quotes and parentheses.
function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let inQuote = false;
  let cur = "";
  for (const ch of s) {
    if (ch === '"') inQuote = !inQuote;
    if (!inQuote) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        out.push(cur);
        cur = "";
        continue;
      }
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((p) => p.trim()).filter(Boolean);
}

/** One `op.value` clause on `column` → predicate over a row. */
function predicate(column, expr) {
  const dot = expr.indexOf(".");
  const op = dot === -1 ? expr : expr.slice(0, dot);
  const value = dot === -1 ? "" : expr.slice(dot + 1);
  switch (op) {
    case "eq":
      return (r) => String(r[column]) === unquote(value);
    case "neq":
      return (r) => String(r[column]) !== unquote(value);
    case "gt":
      return (r) => r[column] !== null && compare(r[column], value) > 0;
    case "gte":
      return (r) => r[column] !== null && compare(r[column], value) >= 0;
    case "lt":
      return (r) => r[column] !== null && compare(r[column], value) < 0;
    case "lte":
      return (r) => r[column] !== null && compare(r[column], value) <= 0;
    case "like": {
      const re = likeToRegExp(unquote(value), "");
      return (r) => r[column] !== null && re.test(String(r[column]));
    }
    case "ilike": {
      const re = likeToRegExp(unquote(value), "i");
      return (r) => r[column] !== null && re.test(String(r[column]));
    }
    case "in": {
      const list = splitTopLevel(value.replace(/^\(|\)$/g, "")).map(unquote);
      return (r) => list.includes(String(r[column]));
    }
    case "is":
      return (r) => (value === "null" ? r[column] === null : String(r[column]) === value);
    default:
      throw new PgError(400, "PGRST100", `Unsupported operator "${op}" in mock`);
  }
}

// `or=(a.ilike.x,b.eq.y)` → any clause matches.
function orPredicate(raw) {
  const clauses = splitTopLevel(raw.replace(/^\(|\)$/g, "")).map((c) => {
    const i = c.indexOf(".");
    return predicate(c.slice(0, i), c.slice(i + 1));
  });
  return (r) => clauses.some((p) => p(r));
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function buildFilter(searchParams) {
  const preds = [];
  for (const [key, value] of searchParams) {
    if (RESERVED.has(key)) continue;
    if (key === "or") preds.push(orPredicate(value));
    else if (key === "and") preds.push(andPredicate(value));
    else preds.push(predicate(key, value));
  }
  return (r) => preds.every((p) => p(r));
}

function andPredicate(raw) {
  const clauses = splitTopLevel(raw.replace(/^\(|\)$/g, "")).map((c) => {
    const i = c.indexOf(".");
    return predicate(c.slice(0, i), c.slice(i + 1));
  });
  return (r) => clauses.every((p) => p(r));
}

/* ---------- select / embed ---------- */

function project(row, select, db) {
  if (!select || select.trim() === "*") return { ...row };
  const out = {};
  for (const part of splitTopLevel(select)) {
    const embed = part.match(/^(?:(\w+):)?(\w+)\s*(?:!\w+)?\s*\(([^)]*)\)$/);
    if (embed) {
      const [, alias, table, inner] = embed;
      const fkCol = EMBED_FK[table];
      const target = fkCol ? db[table].find((t) => t.id === row[fkCol]) : undefined;
      out[alias ?? table] = target ? project(target, inner, db) : null;
      continue;
    }
    const [alias, col] = part.includes(":") ? part.split(":") : [part, part];
    out[alias.trim()] = row[col.trim()] ?? null;
  }
  return out;
}

/* ---------- errors ---------- */

class PgError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/* ---------- server ---------- */

export function createMockSupabase({ listings = loadListingRows() } = {}) {
  const db = { listings: listings.map((r) => ({ ...r })), saved_listings: [], recently_viewed: [] };
  // Flip this on to simulate an outage: every request answers 500.
  let outage = false;

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });

  function insertRows(table, rows, { onConflict, mergeDuplicates }) {
    const spec = SCHEMA[table];
    const keyCols = onConflict ? onConflict.split(",").map((s) => s.trim()) : spec.pk;
    const written = [];
    for (const incoming of rows) {
      for (const [col, ref] of Object.entries(spec.fk ?? {})) {
        if (!db[ref].some((t) => t.id === incoming[col])) {
          throw new PgError(
            409,
            "23503",
            `insert or update on table "${table}" violates foreign key constraint "${table}_${col}_fkey"`,
            `Key (${col})=(${incoming[col]}) is not present in table "${ref}".`,
          );
        }
      }
      const existing = db[table].find((r) => keyCols.every((k) => String(r[k]) === String(incoming[k])));
      if (existing) {
        if (!mergeDuplicates) {
          throw new PgError(409, "23505", `duplicate key value violates unique constraint "${table}_pkey"`);
        }
        Object.assign(existing, incoming);
        written.push(existing);
      } else {
        const row = { ...spec.defaults(), ...incoming };
        db[table].push(row);
        written.push(row);
      }
    }
    return written;
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://mock");
    const wantsObject = (req.headers.accept ?? "").includes("application/vnd.pgrst.object+json");
    const send = (status, body, headers = {}) => {
      // `.single()` asks for exactly one row as an object rather than an array.
      if (wantsObject && Array.isArray(body)) {
        if (body.length !== 1) {
          res.writeHead(406, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `Results contain ${body.length} rows`, hint: null }));
        }
        body = body[0];
      }
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };

    try {
      // Test hooks, not part of PostgREST.
      if (url.pathname === "/__mock/outage") {
        outage = url.searchParams.get("on") === "1";
        return send(200, { outage });
      }
      if (url.pathname === "/__mock/reset") {
        db.saved_listings.length = 0;
        db.recently_viewed.length = 0;
        outage = false;
        return send(200, { ok: true });
      }
      if (url.pathname === "/" || url.pathname === "/rest/v1/" || url.pathname === "/rest/v1") {
        return send(200, { mock: "supabase", tables: Object.keys(db) });
      }
      if (outage) throw new PgError(500, "XX000", "mock outage: the database is unavailable");

      const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
      if (!m) throw new PgError(404, "PGRST000", `No route for ${req.method} ${url.pathname}`);
      const table = m[1];
      if (!db[table]) throw new PgError(404, "PGRST205", `Could not find the table 'public.${table}' in the schema cache`);

      const prefer = req.headers.prefer ?? "";
      const select = url.searchParams.get("select") ?? "*";
      const filter = buildFilter(url.searchParams);

      if (req.method === "GET" || req.method === "HEAD") {
        let rows = db[table].filter(filter);
        const order = url.searchParams.get("order");
        if (order) {
          const terms = order.split(",").map((t) => t.split("."));
          rows = [...rows].sort((a, b) => {
            for (const [col, dir] of terms) {
              const c = compare(a[col], b[col]);
              if (c !== 0) return dir === "desc" ? -c : c;
            }
            return 0;
          });
        }
        const total = rows.length;
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = url.searchParams.get("limit");
        rows = rows.slice(offset, limit === null ? undefined : offset + Number(limit));
        const body = rows.map((r) => project(r, select, db));
        const range = body.length ? `${offset}-${offset + body.length - 1}/${total}` : `*/${total}`;
        if (req.method === "HEAD") return send(200, undefined, { "Content-Range": range });
        return send(200, body, { "Content-Range": range });
      }

      if (req.method === "POST") {
        const text = await readBody(req);
        let parsed;
        try {
          parsed = text ? JSON.parse(text) : [];
        } catch {
          throw new PgError(400, "PGRST102", "Empty or invalid json");
        }
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        const written = insertRows(table, rows, {
          onConflict: url.searchParams.get("on_conflict"),
          mergeDuplicates: /resolution=merge-duplicates/.test(prefer),
        });
        if (/return=representation/.test(prefer)) return send(201, written.map((r) => project(r, select, db)));
        return send(201, undefined);
      }

      if (req.method === "PATCH") {
        const patch = JSON.parse((await readBody(req)) || "{}");
        const hit = db[table].filter(filter);
        hit.forEach((r) => Object.assign(r, patch));
        if (/return=representation/.test(prefer)) return send(200, hit.map((r) => project(r, select, db)));
        return send(204, undefined);
      }

      if (req.method === "DELETE") {
        const gone = db[table].filter(filter);
        db[table] = db[table].filter((r) => !gone.includes(r));
        if (/return=representation/.test(prefer)) return send(200, gone.map((r) => project(r, select, db)));
        return send(204, undefined);
      }

      throw new PgError(405, "PGRST000", `Method ${req.method} not supported`);
    } catch (err) {
      if (err instanceof PgError) {
        return send(err.status, { code: err.code, message: err.message, details: err.details, hint: null });
      }
      console.error("[mock-supabase]", err);
      return send(500, { code: "XX000", message: String(err?.message ?? err), details: null, hint: null });
    }
  });

  return {
    db,
    /** Starts listening; resolves with { url, close }. */
    listen: (port = 0, host = "127.0.0.1") =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          const addr = server.address();
          resolve({
            url: `http://${host}:${addr.port}`,
            close: () => new Promise((r) => server.close(() => r())),
          });
        });
      }),
  };
}

/** The env the app needs to talk to a mock started at `url`. */
export function mockEnv(url) {
  return { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: `mock-${randomUUID()}` };
}

// Standalone: `node scripts/mock-supabase.mjs [port]`
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const port = Number(process.argv[2] ?? process.env.MOCK_SUPABASE_PORT ?? 54321);
  const { url } = await createMockSupabase().listen(port);
  console.log(`Mock Supabase listening at ${url}  (tables: listings, saved_listings, recently_viewed)`);
  console.log(`Point the app at it with:\n  SUPABASE_URL=${url} SUPABASE_SERVICE_ROLE_KEY=mock npm run dev`);
}
