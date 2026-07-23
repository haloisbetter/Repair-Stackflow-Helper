import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { TemporaryProposalStore } from "../review/temporary-proposal-store.js";
import type { RejectReason } from "../review/review-contract.js";

const ReviewBody = z.object({
  proposalId: z.string().uuid(),
  reviewStatus: z.enum(["accepted", "accepted_with_edits", "rejected"]),
  reviewerId: z.string().min(1).max(128).optional(),
  rejectReason: z.enum([
    "invented_fact", "missing_fact", "incorrect_tone", "incorrect_structure",
    "privacy_issue", "unclear", "duplicate", "other"
  ]).optional(),
  editedResult: z.record(z.unknown()).optional()
});

const RegenerateBody = z.object({
  jobId: z.string().uuid(),
  requestId: z.string().uuid().optional(),
  taskName: z.string().min(1).max(64)
});

export function registerReviewRoutes(app: FastifyInstance, proposalStore: TemporaryProposalStore): void {
  app.get("/api/v1/review/proposals", async (_req, reply) => {
    const metrics = proposalStore.getReviewMetrics();
    return reply.send({ metrics, proposals: [] });
  });

  app.get("/api/v1/review/proposals/:jobId", async (req, reply) => {
    const { jobId } = req.params as { jobId: string };
    if (!z.string().uuid().safeParse(jobId).success) {
      return reply.status(400).send({ error: { code: "validation_failed", message: "Invalid jobId." } });
    }
    const proposals = proposalStore.getByJobId(jobId);
    return reply.send({
      proposals: proposals.map((p) => ({
        proposalId: p.proposalId,
        jobId: p.jobId,
        requestId: p.requestId,
        taskName: p.taskName,
        taskVersion: p.taskVersion,
        reviewStatus: p.reviewStatus,
        attemptNumber: p.attemptNumber,
        previousProposalId: p.previousProposalId,
        createdAt: p.createdAt,
        expiresAt: p.expiresAt,
        reviewerId: p.reviewerId,
        reviewedAt: p.reviewedAt,
        rejectReason: p.rejectReason,
        editMetrics: p.editMetrics,
        provenance: p.provenance
      }))
    });
  });

  app.get("/api/v1/review/proposals/:jobId/latest", async (req, reply) => {
    const { jobId } = req.params as { jobId: string };
    if (!z.string().uuid().safeParse(jobId).success) {
      return reply.status(400).send({ error: { code: "validation_failed", message: "Invalid jobId." } });
    }
    const proposals = proposalStore.getByJobId(jobId);
    if (proposals.length === 0) {
      return reply.status(404).send({ error: { code: "proposal_not_found", message: "No proposals for this job." } });
    }
    const latest = proposals[proposals.length - 1]!;
    return reply.send({
      proposalId: latest.proposalId,
      jobId: latest.jobId,
      requestId: latest.requestId,
      taskName: latest.taskName,
      taskVersion: latest.taskVersion,
      reviewStatus: latest.reviewStatus,
      attemptNumber: latest.attemptNumber,
      previousProposalId: latest.previousProposalId,
      proposedResult: latest.proposedResult,
      editedResult: latest.editedResult,
      createdAt: latest.createdAt,
      expiresAt: latest.expiresAt,
      reviewerId: latest.reviewerId,
      reviewedAt: latest.reviewedAt,
      rejectReason: latest.rejectReason,
      editMetrics: latest.editMetrics,
      provenance: latest.provenance
    });
  });

  app.post("/api/v1/review/decision", async (req, reply) => {
    const body = req.body as Record<string, unknown> | null;
    const parsed = ReviewBody.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: "validation_failed", message: parsed.error.issues[0]?.message } });
    }
    try {
      const updated = proposalStore.applyReview({
        proposalId: parsed.data.proposalId,
        reviewStatus: parsed.data.reviewStatus,
        reviewerId: parsed.data.reviewerId ?? undefined,
        rejectReason: parsed.data.rejectReason as RejectReason | undefined ?? undefined,
        editedResult: parsed.data.editedResult ?? undefined
      } as Parameters<typeof proposalStore.applyReview>[0]);
      return reply.send({
        proposalId: updated.proposalId,
        reviewStatus: updated.reviewStatus,
        reviewedAt: updated.reviewedAt,
        editMetrics: updated.editMetrics
      });
    } catch (e) {
      return reply.status(400).send({ error: { code: "review_failed", message: e instanceof Error ? e.message : "Review failed." } });
    }
  });
}
