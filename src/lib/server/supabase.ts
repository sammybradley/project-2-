import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The service-role key bypasses Row Level Security, so it must only ever be used
// here, inside Route Handlers. It is deliberately NOT prefixed with NEXT_PUBLIC_
// so Next.js never bundles it into client code.
let client: SupabaseClient | null = null;

export class ConfigError extends Error {}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ConfigError(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.local.example).",
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
