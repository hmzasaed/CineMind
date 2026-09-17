import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { badRequest, notFound } from "../errors.js";
import type { ModerationStore } from "../social/types.js";

const idParam = z.object({ id: z.string().min(1).max(64) });

const listQuery = z.object({
  status: z.enum(["open", "resolved", "dismissed"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const resolveBody = z.object({ status: z.enum(["resolved", "dismissed"]) });
const reviewStatusBody = z.object({ status: z.enum(["published", "hidden", "deleted"]) });

/**
 * Admin-only moderation: review report triage and review status overrides.
 * Only this path may set a review's status to "deleted" — owners can only
 * toggle published/hidden (see routes/reviews.ts's PATCH /reviews/:id).
 */
export function registerModerationRoutes(
  app: FastifyInstance,
  deps: {
    store: ModerationStore;
    requireAuth?: preHandlerHookHandler;
    requireAdmin?: preHandlerHookHandler;
  },
): void {
  const preHandler = [deps.requireAuth, deps.requireAdmin].filter(
    (h): h is preHandlerHookHandler => h !== undefined,
  );

  app.get("/admin/review-reports", { preHandler }, async (req) => {
    const query = listQuery.safeParse(req.query);
    if (!query.success) throw badRequest("Invalid query");
    const { reports, meta } = await deps.store.listReports(query.data);
    return { reports, meta };
  });

  app.patch("/admin/review-reports/:id", { preHandler }, async (req) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid report id");
    const body = resolveBody.safeParse(req.body);
    if (!body.success) throw badRequest("Invalid status");
    const report = await deps.store.resolveReport(params.data.id, body.data.status);
    if (!report) throw notFound("Report not found");
    return { report };
  });

  app.patch("/admin/reviews/:id/status", { preHandler }, async (req) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid review id");
    const body = reviewStatusBody.safeParse(req.body);
    if (!body.success) throw badRequest("Invalid status");
    const review = await deps.store.setReviewStatus(params.data.id, body.data.status);
    if (!review) throw notFound("Review not found");
    return { review };
  });
}
