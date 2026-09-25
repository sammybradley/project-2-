import { handle, HttpError, ok, readJson } from "@/lib/api";
import { isOutage, setOutage } from "@/lib/store";

// Development-only switch that makes the store fail like a database outage, so
// you can see (and test) how every route reports errors instead of pretending.
//   POST /api/dev/outage { "on": true }   → every route answers 500 (health: 503)
//   POST /api/dev/outage { "on": false }  → back to normal
// In a production build (`next start`) this route does not exist.
const guard = () => {
  if (process.env.NODE_ENV === "production") throw new HttpError(404, "No such endpoint.");
};

export const GET = handle(async () => {
  guard();
  return ok({ outage: isOutage() });
});

export const POST = handle(async (req: Request) => {
  guard();
  const body = await readJson<{ on: boolean }>(req);
  if (typeof body.on !== "boolean") throw new HttpError(400, "Send { \"on\": true } or { \"on\": false }.");
  return ok({ outage: setOutage(body.on) });
});
