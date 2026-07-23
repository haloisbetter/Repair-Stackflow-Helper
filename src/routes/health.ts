import type { FastifyInstance } from "fastify";
import type { HelperContext } from "../helper-context.js";
import { redactObject } from "../diagnostics/redaction.js";

export function registerHealthRoutes(app: FastifyInstance, ctx: HelperContext): void {
  app.get("/api/v1/health", async (_req, reply) => {
    const health = await ctx.refreshHealth();
    return reply.send({
      status: "ok",
      helperId: ctx.identity.helperId,
      pairingState: ctx.identity.pairingState,
      health
    });
  });

  app.get("/api/v1/status", async (_req, reply) => {
    const snapshot = ctx.store.snapshot();
    return reply.send({
      identity: {
        helperId: ctx.identity.helperId,
        helperName: ctx.identity.helperName,
        role: ctx.identity.role,
        pairingState: ctx.identity.pairingState,
        organizationId: ctx.identity.organizationId ?? null,
        locationId: ctx.identity.locationId ?? null,
        appVersion: ctx.identity.appVersion,
        platform: ctx.identity.platform,
        architecture: ctx.identity.architecture
      },
      config: {
        executionTarget: ctx.config.executionTarget,
        ollamaEndpoint: ctx.config.ollamaEndpoint,
        approvedModel: ctx.config.approvedModel,
        providerSelection: ctx.config.providerSelection,
        mockProviderEnabled: ctx.config.mockProviderEnabled,
        requestTimeoutMs: ctx.config.requestTimeoutMs,
        maxRequestBytes: ctx.config.maxRequestBytes,
        maxResponseBytes: ctx.config.maxResponseBytes
      },
      health: ctx.getHealth(),
      lastPairing: ctx.lastPairing,
      store: {
        active: snapshot.active ? { jobId: snapshot.active.jobId, task: snapshot.active.task } : null,
        completedCount: snapshot.completedCount,
        failureCount: snapshot.failureCount,
        completed: snapshot.completed.map((r) => ({
          jobId: r.jobId,
          task: r.task,
          status: r.status,
          provider: r.provider,
          model: r.model,
          timing: r.timing,
          storedAt: r.storedAt,
          result: redactObject(r.result)
        }))
      }
    });
  });
}
