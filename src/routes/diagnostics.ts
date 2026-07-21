import type { FastifyInstance } from "fastify";
import type { HelperContext } from "../helper-context.js";

export function registerDiagnosticsRoutes(app: FastifyInstance, ctx: HelperContext): void {
  app.get("/api/v1/diagnostics", async (_req, reply) => {
    return reply.send(ctx.diagnostics.snapshot());
  });
}
