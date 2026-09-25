// `npm run dev:mock` – run the app against the in-memory mock Supabase, for
// trying it out before a real Supabase project is configured. Saved and
// recently-viewed rows live only as long as this process does.

import { spawn } from "node:child_process";
import { createMockSupabase, mockEnv } from "./mock-supabase.mjs";

const mockPort = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);
const { url, close } = await createMockSupabase().listen(mockPort);
console.log(`\n▲ Mock Supabase at ${url} (in-memory; nothing is persisted)\n`);

const next = spawn("npx", ["next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, ...mockEnv(url), NEXT_PUBLIC_MOCK_SUPABASE: "1" },
});

const stop = async () => {
  next.kill("SIGINT");
  await close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
next.on("exit", (code) => close().then(() => process.exit(code ?? 0)));
