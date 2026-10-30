import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function getDatabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  const url = import.meta.env["VITE_SUPABASE_URL"];
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  // Only the public project key belongs here. All table access is protected by RLS;
  // privileged writes use membership-checked database functions.
  // Reuse Lovable's generated client, including its preview-session broker and
  // opaque publishable-key handling. SQL migrations are authoritative while
  // generated database types catch up with the new tables and RPCs.
  return supabase as unknown as SupabaseClient;
}
