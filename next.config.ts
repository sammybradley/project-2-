import type { NextConfig } from "next";

// The frontend never talks to a database. Every fetch("/api/…") from the browser
// lands here and is forwarded to the backend (backend/, a separate Next.js app)
// – cookies and status codes pass through unchanged. Set BACKEND_URL to point
// somewhere other than the local backend (e.g. a deployed one).
const backendUrl = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Keep Turbopack scoped to this folder (a stray lockfile lives in the home dir).
  turbopack: { root: __dirname },
  agentRules: false,
  // Let the dev server be opened as http://127.0.0.1:3000 as well as localhost.
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
