import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppRole, ProfileRoleStore } from "../auth/types.js";

/**
 * Typed admin-facing service client. The service-role key lives only here,
 * server-side; never expose this client (or its key) to the browser. Route
 * code depends on narrow interfaces (ProfileRoleStore) so clients are
 * swappable in tests.
 */
export interface SupabaseService {
  /** Resolve the application role from public.profiles. Null if unknown. */
  getProfileRole(userId: string): Promise<AppRole | null>;
  /** Resolve the account email from auth.users. Null if unknown. */
  getUserEmail(userId: string): Promise<string | null>;
}

export function createSupabaseAdminService(opts: {
  url: string;
  serviceRoleKey: string;
}): SupabaseService {
  const admin = createSupabaseAdminClient(opts.url, opts.serviceRoleKey);

  const getProfileRole: SupabaseService["getProfileRole"] = async (userId) => {
    const { data, error } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return data.role as AppRole;
  };

  const getUserEmail: SupabaseService["getUserEmail"] = async (userId) => {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    return data.user.email ?? null;
  };

  return { getProfileRole, getUserEmail };
}

export function createSupabaseAdminClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: {
      // Server-side; sessions are the caller's concern, not this client's.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/** Make the admin service usable wherever a ProfileRoleStore is expected. */
export function asProfileRoleStore(service: SupabaseService): ProfileRoleStore {
  return { getRole: (userId) => service.getProfileRole(userId) };
}