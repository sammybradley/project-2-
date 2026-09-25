import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Turbopack scoped to this folder (the frontend lives one level up).
  turbopack: { root: __dirname },
  agentRules: false,
  // Every request is logged by `handle()` in src/lib/api.ts with its status
  // code, so Next's own request line would just repeat it.
  logging: { incomingRequests: false },
};

export default nextConfig;
