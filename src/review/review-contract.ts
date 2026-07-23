/**
 * Proposal review lifecycle contracts.
 *
 * AI output is always a draft. Every result goes through a review lifecycle
 * before final disposition. The Helper does not permanently own review records —
 * in production, disposition is submitted to or received from Repair StackFlow.
 */
import { z } from "zod";
import { IsoTimestamp, Uuid } from "../contracts/v1/common.js";

export const ReviewStatus = z.enum([
  "pending_review",
  "accepted",
  "accepted_with_edits",
  "rejected",
  "expired"
]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

export const RejectReason = z.enum([
  "invented_fact",
  "missing_fact",
  "incorrect_tone",
  "incorrect_structure",
  "privacy_issue",
  "unclear",
  "duplicate",
  "other"
]);
export type RejectReason = z.infer<typeof RejectReason>;

export const ProposalRecord = z.object({
  proposalId: Uuid,
  jobId: Uuid,
  requestId: Uuid,
  taskName: z.string().min(1).max(64),
  taskVersion: z.string().min(1).max(16),
  inputSchemaVersion: z.string().min(1).max(16),
  outputSchemaVersion: z.string().min(1).max(16),
  promptTemplateVersion: z.string().min(1).max(16),
  submissionKey: z.string().min(16).max(256),
  attemptNumber: z.number().int().nonnegative(),
  previousProposalId: Uuid.nullable(),
  proposedResult: z.record(z.unknown()),
  reviewStatus: ReviewStatus,
  reviewerId: z.string().min(1).max(128).nullable(),
  reviewedAt: IsoTimestamp.nullable(),
  rejectReason: RejectReason.nullable(),
  editedResult: z.record(z.unknown()).nullable(),
  editMetrics: z.object({
    fieldCount: z.number().int().nonnegative(),
    charDelta: z.number().int()
  }).nullable(),
  provenance: z.object({
    provider: z.enum(["ollama", "mock"]),
    model: z.string().min(1).max(128),
    executionTarget: z.enum(["local_on_this_machine", "remote_store_ai"]),
    durationMs: z.number().int().nonnegative(),
    mockProviderUsed: z.boolean(),
    assistantProfileVersion: z.number().int().nonnegative(),
    instructionProfileVersion: z.number().int().nonnegative(),
    toolPolicyVersion: z.number().int().nonnegative()
  }).strict(),
  createdAt: IsoTimestamp,
  expiresAt: IsoTimestamp
}).strict();
export type ProposalRecord = z.infer<typeof ProposalRecord>;

export const VALID_REVIEW_TRANSITIONS: Record<ReviewStatus, readonly ReviewStatus[]> = {
  pending_review: ["accepted", "accepted_with_edits", "rejected", "expired"],
  accepted: [],
  accepted_with_edits: [],
  rejected: [],
  expired: []
};

export function canTransitionReview(from: ReviewStatus, to: ReviewStatus): boolean {
  return VALID_REVIEW_TRANSITIONS[from].includes(to);
}

export function isReviewTerminal(status: ReviewStatus): boolean {
  return status === "accepted" || status === "accepted_with_edits" || status === "rejected" || status === "expired";
}
