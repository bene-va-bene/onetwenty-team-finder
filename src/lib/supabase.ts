import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const isConfigured = Boolean(supabaseUrl && supabaseKey);
let browserClient: SupabaseClient | undefined;

// Browser-only session. Server routes create a fresh, non-persistent client per request.
export function browserSupabase() {
  if (typeof window === "undefined") throw new Error("Browser client used on the server");
  if (!isConfigured) throw new Error("Please configure Supabase in .env.local and restart the app.");
  return browserClient ??= createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

export function requestSupabase(token?: string) {
  if (!isConfigured) throw new Error("Supabase is not configured");
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}
