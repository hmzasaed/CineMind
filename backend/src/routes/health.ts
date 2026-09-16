import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/health", async () => {
    return { status: "ok", service: "cinemind-backend", time: new Date().toISOString() };
  });
}