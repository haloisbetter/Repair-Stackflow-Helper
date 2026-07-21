import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { HelperContext } from "../helper-context.js";
import { ProtocolError } from "../contracts/v1/errors.js";
import { SCHEMA_VERSION } from "../contracts/v1/common.js";
import { newJobIds } from "../jobs/temporary-job-store.js";

const FormatNoteBody = z.object({
  technicianNote: z.string().min(1).max(4096),
  outputStyle: z.enum(["professional_repair_note"]).default("professional_repair_note")
});

const ProviderBody = z.object({
  provider: z.enum(["ollama", "mock", "auto"])
});

const ConfigBody = z.object({
  ollamaEndpoint: z.string().url().optional(),
  approvedModel: z.string().min(1).max(128).optional(),
  requestTimeoutMs: z.number().int().positive().optional(),
  maxRequestBytes: z.number().int().positive().optional(),
  maxResponseBytes: z.number().int().positive().optional()
});

const PairBody = z.object({
  pairingCode: z.string().min(1).max(128)
});

export function registerConversationRoutes(app: FastifyInstance, ctx: HelperContext, startTime: number): void {
  // Conversation bootstrap — returns everything the UI needs on first load
  app.get("/api/v1/conversation/bootstrap", async (_req, reply) => {
    const health = ctx.getHealth();
    return reply.send({
      identity: {
        helperName: ctx.identity.helperName,
        role: ctx.identity.role,
        pairingState: ctx.identity.pairingState,
        organizationId: ctx.identity.organizationId ?? null,
        locationId: ctx.identity.locationId ?? null,
        appVersion: ctx.identity.appVersion
      },
      config: {
        executionTarget: ctx.config.executionTarget,
        providerSelection: ctx.config.providerSelection,
        ollamaEndpoint: ctx.config.ollamaEndpoint,
        approvedModel: ctx.config.approvedModel,
        mockProviderEnabled: ctx.config.mockProviderEnabled
      },
      health: health
        ? {
            state: health.state,
            provider: health.provider,
            ollamaReachable: health.ollamaReachable,
            modelAvailable: health.modelAvailable,
            latencyMs: health.latencyMs
          }
        : null,
      lastPairing: ctx.lastPairing
        ? { organizationId: ctx.lastPairing.organizationId, locationName: ctx.lastPairing.locationName }
        : null
    });
  });

  // Action: format technician note — routes through the existing job runner
  app.post("/api/v1/actions/format-technician-note", async (req, reply) => {
    if (ctx.identity.pairingState !== "paired_ready") {
      return reply
        .status(409)
        .send(new ProtocolError("helper_unpaired", "Helper must be paired before running jobs.", false).toResponse());
    }
    const parsed = FormatNoteBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(new ProtocolError("validation_failed", "Invalid request body.", false).toResponse());
    }
    const { technicianNote, outputStyle } = parsed.data;
    const ids = newJobIds();
    const jobPayload = {
      schemaVersion: SCHEMA_VERSION,
      jobId: ids.jobId,
      requestId: ids.requestId,
      task: "format_technician_note" as const,
      organizationId: ctx.identity.organizationId,
      locationId: ctx.identity.locationId,
      assignedHelperId: ctx.identity.helperId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      input: { technicianNote, outputStyle }
    };

    const existing = ctx.store.getResultByJob(ids.jobId);
    if (existing) {
      return reply.send({ status: "completed", result: existing, duplicate: true });
    }

    const outcome = await ctx.jobRunner.run({ rawJob: jobPayload });
    if (outcome.status === "completed" && outcome.result) {
      return reply.send({ status: "completed", result: outcome.result });
    }
    const failure = outcome.failure;
    const status = failure?.retriable ? 503 : 422;
    return reply.status(status).send({ status: "failed", failure });
  });

  // Action: test AI connection — always tests real Ollama, never the mock
  app.post("/api/v1/actions/test-ai", async (_req, reply) => {
    const { OllamaProvider } = await import("../ai/ollama-provider.js");
    const ollama = new OllamaProvider({ endpoint: ctx.config.ollamaEndpoint });
    const ollamaHealth = await ollama.healthCheck();
    const modelCheck = await ollama.checkModel(ctx.config.approvedModel);
    return reply.send({
      ollamaReachable: ollamaHealth.status === "available",
      modelAvailable: modelCheck.available,
      latencyMs: ollamaHealth.latencyMs,
      status: ollamaHealth.status,
      detail: ollamaHealth.detail ?? null,
      approvedModel: ctx.config.approvedModel,
      currentProvider: ctx.config.providerSelection
    });
  });

  // Action: clear temporary results + conversation
  app.post("/api/v1/actions/clear", async (_req, reply) => {
    ctx.store.clearAllResults();
    return reply.send({ cleared: true });
  });

  // Developer status — never includes technician-note content
  app.get("/api/v1/developer/status", async (_req, reply) => {
    const health = ctx.getHealth();
    const store = ctx.store.snapshot();
    const diag = ctx.diagnostics.snapshot();
    const lastCompleted = store.completed.length > 0 ? store.completed[store.completed.length - 1] : null;
    return reply.send({
      runtime: {
        appVersion: ctx.identity.appVersion,
        environment: process.env.NODE_ENV ?? "development",
        host: process.env.HOST ?? "127.0.0.1",
        port: Number(process.env.PORT ?? 8787),
        platform: ctx.identity.platform,
        architecture: ctx.identity.architecture,
        uptimeMs: Date.now() - startTime
      },
      identity: {
        helperId: ctx.identity.helperId,
        helperName: ctx.identity.helperName,
        role: ctx.identity.role,
        pairingState: ctx.identity.pairingState,
        organizationId: ctx.identity.organizationId ?? null,
        locationId: ctx.identity.locationId ?? null
      },
      aiRuntime: {
        executionTarget: ctx.config.executionTarget,
        selectedProvider: ctx.config.providerSelection,
        ollamaEndpoint: ctx.config.ollamaEndpoint,
        approvedModel: ctx.config.approvedModel,
        endpointStatus: health?.ollamaReachable ? "reachable" : "unreachable",
        modelStatus: health?.modelAvailable ? "available" : "unavailable",
        lastHealthCheck: health?.checkedAt ?? null,
        responseLatencyMs: health?.latencyMs ?? null
      },
      jobs: {
        activeJobId: store.active?.jobId ?? null,
        lastCompletedJobId: lastCompleted?.jobId ?? null,
        lastTask: lastCompleted?.task ?? null,
        temporaryResultCount: store.completedCount,
        failureCount: store.failureCount,
        lastErrorCode: diag.errorCode
      },
      diagnostics: diag
    });
  });

  // Developer: reset helper state (development only)
  app.post("/api/v1/developer/reset", async (_req, reply) => {
    ctx.store.clearAllResults();
    return reply.send({ reset: true });
  });

  // Developer: pair
  app.post("/api/v1/dev/pair", async (req, reply) => {
    const parsed = PairBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(new ProtocolError("pairing_code_invalid", "Invalid pairing request body.", false).toResponse());
    }
    try {
      const result = await ctx.pair(parsed.data.pairingCode);
      return reply.send({ paired: true, ...result });
    } catch (e) {
      const err = e instanceof ProtocolError ? e : new ProtocolError("internal_error", "Pairing failed.", false);
      const status = err.code === "pairing_code_invalid" ? 400 : err.code === "pairing_code_expired" ? 410 : 500;
      return reply.status(status).send(err.toResponse());
    }
  });

  // Developer: unpair
  app.post("/api/v1/dev/unpair", async (_req, reply) => {
    await ctx.unpair();
    return reply.send({ unpaired: true, unpairedAt: new Date().toISOString() });
  });

  // Developer: select provider
  app.post("/api/v1/dev/provider/select", async (req, reply) => {
    const parsed = ProviderBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "validation_failed", message: "provider must be ollama|mock|auto", retriable: false }
      });
    }
    ctx.setProviderSelection(parsed.data.provider);
    return reply.send({ selected: parsed.data.provider });
  });

  // Developer: update config
  app.post("/api/v1/dev/config", async (req, reply) => {
    const parsed = ConfigBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "validation_failed", message: "Invalid config body.", retriable: false }
      });
    }
    try {
      const updates: Record<string, unknown> = {};
      const data = parsed.data;
      if (data.ollamaEndpoint !== undefined) updates.ollamaEndpoint = data.ollamaEndpoint;
      if (data.approvedModel !== undefined) updates.approvedModel = data.approvedModel;
      if (data.requestTimeoutMs !== undefined) updates.requestTimeoutMs = data.requestTimeoutMs;
      if (data.maxRequestBytes !== undefined) updates.maxRequestBytes = data.maxRequestBytes;
      if (data.maxResponseBytes !== undefined) updates.maxResponseBytes = data.maxResponseBytes;
      ctx.setConfig(updates);
      return reply.send({ updated: true, config: ctx.getConfig() });
    } catch (e) {
      return reply.status(400).send({
        error: { code: "validation_failed", message: e instanceof Error ? e.message : String(e), retriable: false }
      });
    }
  });
}
