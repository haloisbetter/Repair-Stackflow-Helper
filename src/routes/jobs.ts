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

const ClearParams = z.object({ jobId: z.string().uuid() });
const JobIdParams = z.object({ jobId: z.string().uuid() });

export function registerJobRoutes(app: FastifyInstance, ctx: HelperContext): void {
  app.post("/api/v1/dev/jobs/format-technician-note", async (req, reply) => {
    if (ctx.identity.pairingState !== "paired_ready") {
      return reply.status(409).send(new ProtocolError("helper_unpaired", "Helper must be paired before running jobs.", false).toResponse());
    }
    const parsed = FormatNoteBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(new ProtocolError("validation_failed", "Invalid request body.", false).toResponse());
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

  app.get("/api/v1/dev/jobs/:jobId", async (req, reply) => {
    const params = JobIdParams.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send(new ProtocolError("validation_failed", "Invalid jobId.", false).toResponse());
    }
    const result = ctx.store.getResultByJob(params.data.jobId);
    if (result) return reply.send({ status: "completed", result });
    const failure = ctx.store.getFailure(params.data.jobId);
    if (failure) return reply.send({ status: "failed", failure });
    return reply.status(404).send(new ProtocolError("result_not_found", "No result found for jobId.", false).toResponse());
  });

  app.post("/api/v1/dev/jobs/:jobId/clear", async (req, reply) => {
    const params = ClearParams.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send(new ProtocolError("validation_failed", "Invalid jobId.", false).toResponse());
    }
    const cleared = ctx.store.clearResult(params.data.jobId);
    return reply.send({ cleared });
  });
}
