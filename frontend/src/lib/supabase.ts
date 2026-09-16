import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthClientLike } from "./auth-context";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

/**
 * Singleton Supabase client. Only the anon key lives here - the service role
 * key and any provider API keys stay on the backend and are never bundled.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
  }
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

/**
 * The auth-friendly surface used by the app. Narrower than SupabaseClient so
 * tests can inject a fake without pulling in supabase-js.
 */
export function getAuthClient(): AuthClientLike {
  return getSupabase() as unknown as AuthClientLike;
}