import { describeApi, handle } from "@/lib/api";

// GET / – a friendly index of the endpoints, so opening the backend in a browser isn't a 404.
export const GET = handle(async () => describeApi());
