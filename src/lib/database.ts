import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getDatabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  const url = import.meta.env["VITE_SUPABASE_URL"];
  const key =
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_ANON_KEY"];
  if (!url || !key) return null;
  // Only the public project key belongs here. All table access is protected by RLS;
  // privileged writes use membership-checked database functions.
  client ??= createClient(url, key);
  return client;
}
