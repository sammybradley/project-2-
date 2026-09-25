import { describeApi, handle } from "@/lib/api";

// GET /api – same index as GET /.
export const GET = handle(async () => describeApi());
