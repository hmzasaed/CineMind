import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthClientLike, AuthSessionLike, AuthErrorLike, AuthUserLike } from "./auth-context";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes("your-project"));
}

/**
 * Singleton Supabase client. Only the anon key lives here - the service role
 * key and any provider API keys stay on the backend and are never bundled.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
  }
  client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

/**
 * Stand-in used when Supabase env vars are absent, so the app still renders
 * (browsing is public) instead of crashing at mount. Every write path reports
 * that auth is unavailable rather than failing silently.
 */
class GuestAuthClient implements AuthClientLike {
  async getSession(): Promise<{ data: { session: AuthSessionLike | null }; error: AuthErrorLike | null }> {
    return { data: { session: null }, error: null };
  }

  onAuthStateChange(_listener: (event: string, session: AuthSessionLike | null) => void) {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }

  async signUp(_input: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string };
  }): Promise<{
    data: { session: AuthSessionLike | null; user: AuthUserLike | null };
    error: AuthErrorLike | null;
  }> {
    return {
      data: { session: null, user: null },
      error: { message: "Authentication is not configured in this environment (guest mode)." },
    };
  }

  async signInWithPassword(_input: { email: string; password: string }): Promise<{
    data: { session: AuthSessionLike | null; user: AuthUserLike | null };
    error: AuthErrorLike | null;
  }> {
    return {
      data: { session: null, user: null },
      error: { message: "Authentication is not configured in this environment (guest mode)." },
    };
  }

  async signOut(): Promise<{ error: AuthErrorLike | null }> {
    return { error: null };
  }

  async resetPasswordForEmail(_email: string): Promise<{ error: AuthErrorLike | null }> {
    return { error: { message: "Authentication is not configured in this environment." } };
  }

  async setSession(_input: {
    access_token: string;
    refresh_token?: string | null;
  }): Promise<{
    data: { session: AuthSessionLike | null };
    error: AuthErrorLike | null;
  }> {
    return { data: { session: null }, error: null };
  }

  async updateUser(_attributes: { password?: string; email?: string }): Promise<{
    data: { user: AuthUserLike | null };
    error: AuthErrorLike | null;
  }> {
    return {
      data: { user: null },
      error: { message: "Authentication is not configured in this environment." },
    };
  }

  async refreshSession(): Promise<{
    data: { session: AuthSessionLike | null };
    error: AuthErrorLike | null;
  }> {
    return { data: { session: null }, error: null };
  }
}

const guestClient = new GuestAuthClient();

/**
 * The auth-friendly surface used by the app. Narrower than SupabaseClient so
 * tests can inject a fake without pulling in supabase-js. Supabase's client
 * exposes these methods on `.auth`, so that sub-object is what satisfies the
 * interface — returning the root client would break every call.
 */
export function getAuthClient(): AuthClientLike {
  if (!isSupabaseConfigured()) return guestClient;
  return getSupabase().auth as unknown as AuthClientLike;
}
