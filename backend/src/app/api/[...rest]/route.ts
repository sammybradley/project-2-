import { fail, handle } from "@/lib/api";

// Anything under /api that no other route claims answers with the JSON envelope
// (and a 404) instead of Next's HTML "page not found".
const notFound = handle(async () => fail(404, "No such endpoint. GET /api lists the available ones."));

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
