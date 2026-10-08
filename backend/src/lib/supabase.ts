// The Supabase client the backend uses – one per process, created lazily.
//
// It authenticates with the service-role key, which bypasses row-level
// security: that's fine here because this code only runs on the server, and
// the tables allow nothing else (see supabase/schema.sql). Never ship this key
// to a browser.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL?.trim();
// Supabase now calls it a "secret key" (sb_secret_…); older projects show a
// "service_role" JWT. Either works, under either name.
const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();

/** True when SUPABASE_URL and a key (SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY) are set. */
export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | undefined;

export function supabase(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase is not configured (set SUPABASE_URL and SUPABASE_SECRET_KEY).");
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
