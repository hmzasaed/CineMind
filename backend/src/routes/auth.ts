import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ProfileRoleStore } from "../auth/types.js";

export interface AuthRouteDeps {
  requireAuth: preHandlerHookHandler;
  requireAdmin: preHandlerHookHandler;
  profileStore: ProfileRoleStore;
}

/**
 * Auth surface for the API. These are deliberately thin "protected test"
 * endpoints to prove token verification, session identity, and role-aware
 * authorization without adding movie-specific business logic.
 */
export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  app.get(
    "/auth/me",
    { preHandler: deps.requireAuth },
    async (req) => {
      const auth = req.auth;
      if (!auth) throw new Error("requireAuth did not attach an identity");
      const appRole = await deps.profileStore.getRole(auth.userId);
      return {
        user: {
          id: auth.userId,
          email: auth.email ?? null,
          role: appRole,
          authRole: auth.authRole,
        },
      };
    },
  );

  app.get(
    "/admin/ping",
    { preHandler: [deps.requireAuth, deps.requireAdmin] },
    async () => {
      return { ok: true, service: "cinemind-backend", admin: true };
    },
  );
}