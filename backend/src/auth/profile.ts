import { asProfileRoleStore, createSupabaseAdminService } from "../services/supabase.js";
import type { AppRole, ProfileRoleStore } from "./types.js";

/**
 * In-memory profile store for local development/tests where a Supabase
 * project is not reachable. Production uses the Supabase admin service.
 */
export class StaticProfileRoleStore implements ProfileRoleStore {
  constructor(private readonly roles: Record<string, AppRole>) {}

  async getRole(userId: string): Promise<AppRole | null> {
    return this.roles[userId] ?? null;
  }
}

/** Default store for the running configuration. */
export function createProfileStore(config: {
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
}): ProfileRoleStore {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    return asProfileRoleStore(
      createSupabaseAdminService({
        url: config.supabaseUrl,
        serviceRoleKey: config.supabaseServiceRoleKey,
      }),
    );
  }
  // Local development without a Supabase project: no roles are resolvable, so
  // admin endpoints stay locked down and /auth/me reports role: null. The
  // token verifier (JWT_SECRET) still gates everything else.
  return new StaticProfileRoleStore({});
}