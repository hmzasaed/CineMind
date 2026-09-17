import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ProfileStatsStore } from "../social/types.js";

/** Always the caller's own stats — the interface takes no userId, only req.auth!.userId. */
export function registerProfileRoutes(
  app: FastifyInstance,
  deps: { profileStatsStore: ProfileStatsStore; requireAuth: preHandlerHookHandler },
): void {
  app.get("/profile/stats", { preHandler: deps.requireAuth }, async (req) => {
    const stats = await deps.profileStatsStore.get(req.auth!.userId);
    return { stats };
  });
}
