import type { FastifyReply, FastifyRequest } from "fastify";
import { unauthorized } from "../errors.js";

/**
 * Require a valid JWT. Attaches { userId } to the request at req.user.
 * This keeps the backend interface stable: swap @fastify/jwt for any
 * compliant verifier without touching route code.
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await req.jwtVerify();
  } catch {
    await reply.code(401).send({ error: { code: "UNAUTHORIZED", message: unauthorized().message } });
  }
}