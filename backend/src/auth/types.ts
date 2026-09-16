import "fastify";

/** Application roles stored on public.profiles. Matches the DB check constraint. */
export type AppRole = "user" | "admin";

/**
 * Authenticated identity attached to a request after a token passes
 * verification. `appRole` is only set once a profile store resolves it.
 */
export interface AuthenticatedUser {
  /** `sub` from the verified Supabase access token. */
  userId: string;
  email?: string;
  /** The JWT `role` claim ("authenticated" for a normal session). */
  authRole: string;
  /** Resolved from public.profiles; undefined until a profile lookup runs. */
  appRole?: AppRole;
}

/** Verifies a bearer token and returns the identity, or null when invalid. */
export interface TokenVerifier {
  verify(token: string): Promise<AuthenticatedUser | null>;
}

/** Reads an application role for a user. Authoritative source is profiles. */
export interface ProfileRoleStore {
  getRole(userId: string): Promise<AppRole | null>;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set by requireAuth for routes protected with it. Absent on public routes. */
    auth?: AuthenticatedUser;
  }
}