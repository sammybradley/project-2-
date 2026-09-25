import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Turbopack scoped to this folder (a stray lockfile lives in the home dir).
  turbopack: { root: __dirname },
  agentRules: false,
  // Let the dev server be opened as http://127.0.0.1:3000 as well as localhost.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
