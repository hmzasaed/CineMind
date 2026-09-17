import type { FastifyReply, FastifyRequest } from "fastify";
import { forbidden, unauthorized } from "../errors.js";
import type { AppRole, ProfileRoleStore, TokenVerifier } from "./types.js";

/** Extract a bearer token from an Authorization header, or null. */
export function parseBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

function authFailure(reply: FastifyReply): FastifyReply {
  return reply
    .code(401)
    .header("www-authenticate", 'Bearer realm="cinemind"')
    .send({ error: { code: "UNAUTHORIZED", message: unauthorized().message } });
}

/**
 * Require a verified access token. On success attaches the identity at
 * req.auth. Swap the verifier per environment (Supabase JWKS vs local secret).
 */
export function makeRequireAuth(verifier: TokenVerifier) {
  return async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = parseBearer(req.headers.authorization);
    if (!token) {
      authFailure(reply);
      return;
    }
    const user = await verifier.verify(token);
    if (!user) {
      authFailure(reply);
      return;
    }
    req.auth = user;
  };
}

/**
 * Attaches req.auth when a valid bearer token is present, but never rejects
 * the request — for public endpoints whose response shape depends on whether
 * the caller is known (e.g. including a viewer's own hidden review, or
 * likedByMe). An invalid/expired token is treated the same as no token: the
 * request proceeds anonymously rather than failing.
 */
export function makeOptionalAuth(verifier: TokenVerifier) {
  return async function optionalAuth(req: FastifyRequest): Promise<void> {
    const token = parseBearer(req.headers.authorization);
    if (!token) return;
    const user = await verifier.verify(token);
    if (user) req.auth = user;
  };
}

/**
 * Role-aware authorization. Runs after requireAuth and resolves the user's
 * application role from the profile store, so a token alone never grants
 * admin - the stored role does.
 */
export function makeRequireAppRole(store: ProfileRoleStore, role: AppRole) {
  return async function requireAppRole(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const auth = req.auth;
    if (!auth) {
      authFailure(reply);
      return;
    }
    const appRole = await store.getRole(auth.userId);
    if (appRole !== role) {
      reply.code(403).send({
        error: { code: "FORBIDDEN", message: forbidden(`Requires role: ${role}`).message },
      });
      return;
    }
    auth.appRole = appRole;
  };
}