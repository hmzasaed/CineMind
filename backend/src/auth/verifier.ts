import { createSecretKey, type KeyObject } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyOptions, type JWTPayload } from "jose";
import type { AuthenticatedUser, AppRole, TokenVerifier } from "./types.js";

const ALLOWED_SIGNING_ALGS = ["HS256", "RS256", "RS384", "RS512", "ES256", "ES384"] as const;

function toAuthenticatedUser(payload: JWTPayload): AuthenticatedUser | null {
  if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
  const role = typeof payload.role === "string" ? payload.role : "";
  // Project/anon/service keys are not user sessions; reject them even when
  // they happen to satisfy the audience check.
  if (role === "service_role" || role === "supabase_admin" || role === "anon") return null;
  const appRole = typeof payload.app_role === "string" ? (payload.app_role as AppRole) : undefined;
  return {
    userId: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    authRole: role || "authenticated",
    appRole,
  };
}

/**
 * HS256 verification against a shared secret. Used for local development and
 * tests (Supabase projects that sign access tokens symmetrically can also use
 * this instead of the JWKS verifier).
 */
export class HmacJwtVerifier implements TokenVerifier {
  private readonly key: KeyObject;

  constructor(
    private readonly opts: {
      secret: string;
      audience?: string | string[];
      issuer?: string;
    },
  ) {
    this.key = createSecretKey(opts.secret, "utf8");
  }

  async verify(token: string): Promise<AuthenticatedUser | null> {
    const options: JWTVerifyOptions = {
      algorithms: ["HS256"],
      audience: this.opts.audience ?? "authenticated",
    };
    if (this.opts.issuer) options.issuer = this.opts.issuer;
    try {
      const { payload } = await jwtVerify(token, this.key, options);
      return toAuthenticatedUser(payload);
    } catch {
      return null;
    }
  }
}

/**
 * Verification against the Supabase JWKS endpoint. The key set is cached with
 * a cooldown so steady-state requests do not re-fetch public keys. Any
 * verification or network failure degrades to "invalid" (401) - never to an
 * open route.
 */
export class SupabaseJwtVerifier implements TokenVerifier {
  private readonly keyset: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    projectUrl: string,
    private readonly opts: {
      audience?: string | string[];
      cacheMaxAgeMs?: number;
      cooldownMs?: number;
    } = {},
  ) {
    this.keyset = createRemoteJWKSet(
      new URL(`${projectUrl.replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`),
      {
        cacheMaxAge: opts.cacheMaxAgeMs ?? 600_000,
        cooldownDuration: opts.cooldownMs ?? 30_000,
        timeoutDuration: 5_000,
      },
    );
  }

  async verify(token: string): Promise<AuthenticatedUser | null> {
    const options: JWTVerifyOptions = {
      algorithms: [...ALLOWED_SIGNING_ALGS],
      audience: this.opts.audience ?? "authenticated",
    };
    try {
      const { payload } = await jwtVerify(token, this.keyset, options);
      return toAuthenticatedUser(payload);
    } catch {
      return null;
    }
  }
}

/** Default verifier for the running configuration. */
export function createTokenVerifier(config: {
  supabaseUrl?: string;
  jwtSecret?: string;
}): TokenVerifier {
  if (config.supabaseUrl) return new SupabaseJwtVerifier(config.supabaseUrl);
  if (config.jwtSecret) return new HmacJwtVerifier({ secret: config.jwtSecret });
  throw new Error(
    "Auth is not configured: set SUPABASE_URL (production) or JWT_SECRET (local dev/tests).",
  );
}