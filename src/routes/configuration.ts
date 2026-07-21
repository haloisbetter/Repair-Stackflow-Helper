import type { FastifyInstance } from "fastify";
import type { HelperContext } from "../helper-context.js";
import { ProtocolError } from "../contracts/v1/errors.js";

export function registerConfigurationRoutes(app: FastifyInstance, ctx: HelperContext): void {
  app.get("/api/v1/dev/configuration/export", async (_req, reply) => {
    try {
      const exported = await ctx.exportConfiguration();
      return reply.send(exported);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed.";
      return reply
        .status(500)
        .send(new ProtocolError("configuration_read_failed", msg, false).toResponse());
    }
  });

  app.post("/api/v1/dev/configuration/import", async (req, reply) => {
    try {
      await ctx.importConfiguration(req.body);
      return reply.send({ imported: true });
    } catch (e) {
      const err = e instanceof ProtocolError
        ? e
        : new ProtocolError("configuration_import_rejected", e instanceof Error ? e.message : "Import rejected.", false);
      return reply.status(400).send(err.toResponse());
    }
  });

  app.post("/api/v1/dev/configuration/reset", async (_req, reply) => {
    try {
      await ctx.resetConfiguration();
      return reply.send({ reset: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Reset failed.";
      return reply
        .status(500)
        .send(new ProtocolError("configuration_write_failed", msg, false).toResponse());
    }
  });

  app.get("/api/v1/dev/configuration/status", async (_req, reply) => {
    const status = ctx.getConfigurationStatus();
    return reply.send({
      configurationLoaded: status.loaded,
      configurationSchemaVersion: status.schemaVersion,
      configurationSource: status.source,
      lastConfigurationSave: status.lastSave,
      persistenceHealthy: status.persistenceHealthy,
      lastPersistenceErrorCode: status.lastPersistenceErrorCode,
      warning: status.warning
    });
  });
}
