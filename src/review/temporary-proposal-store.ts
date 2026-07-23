/**
 * Temporary proposal store for the review workflow.
 *
 * In development mode, this simulates the review lifecycle locally.
 * In production mode, proposals are submitted to Repair StackFlow and
 * review disposition is received from there.
 *
 * Bounded: max 64 proposals. Expires after 30 minutes.
 * Content is never exposed in diagnostics or status endpoints.
 */
import { randomUUID } from "node:crypto";
import type { ProposalRecord, ReviewStatus, RejectReason } from "./review-contract.js";

const MAX_PROPOSALS = 64;
const PROPOSAL_TTL_MS = 30 * 60 * 1000;

export interface CreateProposalInput {
  jobId: string;
  requestId: string;
  taskName: string;
  taskVersion: string;
  inputSchemaVersion: string;
  outputSchemaVersion: string;
  promptTemplateVersion: string;
  submissionKey: string;
  attemptNumber: number;
  previousProposalId: string | null;
  proposedResult: Record<string, unknown>;
  provenance: ProposalRecord["provenance"];
}

export interface ReviewDecisionInput {
  proposalId: string;
  reviewStatus: "accepted" | "accepted_with_edits" | "rejected";
  reviewerId?: string;
  rejectReason?: RejectReason;
  editedResult?: Record<string, unknown>;
}

export class TemporaryProposalStore {
  private proposals = new Map<string, ProposalRecord>();

  create(input: CreateProposalInput): ProposalRecord {
    const now = new Date();
    const proposalId = randomUUID();
    const record: ProposalRecord = {
      proposalId,
      jobId: input.jobId,
      requestId: input.requestId,
      taskName: input.taskName,
      taskVersion: input.taskVersion,
      inputSchemaVersion: input.inputSchemaVersion,
      outputSchemaVersion: input.outputSchemaVersion,
      promptTemplateVersion: input.promptTemplateVersion,
      submissionKey: input.submissionKey,
      attemptNumber: input.attemptNumber,
      previousProposalId: input.previousProposalId,
      proposedResult: input.proposedResult,
      reviewStatus: "pending_review",
      reviewerId: null,
      reviewedAt: null,
      rejectReason: null,
      editedResult: null,
      editMetrics: null,
      provenance: input.provenance,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString()
    };
    this.proposals.set(proposalId, record);
    this.enforceBounds();
    return record;
  }

  get(proposalId: string): ProposalRecord | null {
    const record = this.proposals.get(proposalId);
    if (!record) return null;
    if (this.isExpired(record)) {
      this.proposals.delete(proposalId);
      return null;
    }
    return record;
  }

  getByJobId(jobId: string): ProposalRecord[] {
    this.expireOld();
    return Array.from(this.proposals.values())
      .filter((p) => p.jobId === jobId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getBySubmissionKey(submissionKey: string): ProposalRecord | null {
    this.expireOld();
    return Array.from(this.proposals.values())
      .find((p) => p.submissionKey === submissionKey && p.reviewStatus === "pending_review") ?? null;
  }

  applyReview(input: ReviewDecisionInput): ProposalRecord {
    const record = this.get(input.proposalId);
    if (!record) throw new Error("Proposal not found or expired.");
    if (record.reviewStatus !== "pending_review") {
      throw new Error(`Proposal already reviewed (status: ${record.reviewStatus}).`);
    }

    let editMetrics: ProposalRecord["editMetrics"] = null;
    if (input.reviewStatus === "accepted_with_edits" && input.editedResult) {
      const originalStr = JSON.stringify(record.proposedResult);
      const editedStr = JSON.stringify(input.editedResult);
      const charDelta = editedStr.length - originalStr.length;
      const originalKeys = Object.keys(record.proposedResult);
      const editedKeys = Object.keys(input.editedResult);
      const fieldCount = editedKeys.filter(
        (k) => JSON.stringify(input.editedResult![k]) !== JSON.stringify(record.proposedResult[k])
      ).length;
      editMetrics = { fieldCount, charDelta };
    }

    const updated: ProposalRecord = {
      ...record,
      reviewStatus: input.reviewStatus,
      reviewerId: input.reviewerId ?? null,
      reviewedAt: new Date().toISOString(),
      rejectReason: input.rejectReason ?? null,
      editedResult: input.editedResult ?? null,
      editMetrics
    };
    this.proposals.set(input.proposalId, updated);
    return updated;
  }

  getNextAttemptNumber(jobId: string): number {
    const jobProposals = this.getByJobId(jobId);
    return jobProposals.length;
  }

  getReviewMetrics(): {
    total: number;
    pending: number;
    accepted: number;
    acceptedWithEdits: number;
    rejected: number;
    expired: number;
  } {
    this.expireOld();
    const all = Array.from(this.proposals.values());
    return {
      total: all.length,
      pending: all.filter((p) => p.reviewStatus === "pending_review").length,
      accepted: all.filter((p) => p.reviewStatus === "accepted").length,
      acceptedWithEdits: all.filter((p) => p.reviewStatus === "accepted_with_edits").length,
      rejected: all.filter((p) => p.reviewStatus === "rejected").length,
      expired: all.filter((p) => p.reviewStatus === "expired").length
    };
  }

  clear(): void {
    this.proposals.clear();
  }

  private isExpired(record: ProposalRecord): boolean {
    return new Date(record.expiresAt).getTime() <= Date.now();
  }

  private expireOld(): void {
    for (const [id, record] of this.proposals) {
      if (this.isExpired(record)) {
        const expired = { ...record, reviewStatus: "expired" as ReviewStatus };
        this.proposals.set(id, expired);
        this.proposals.delete(id);
      }
    }
  }

  private enforceBounds(): void {
    if (this.proposals.size <= MAX_PROPOSALS) return;
    const sorted = Array.from(this.proposals.entries())
      .sort((a, b) => a[1].createdAt.localeCompare(b[1].createdAt));
    while (this.proposals.size > MAX_PROPOSALS && sorted.length > 0) {
      const [id] = sorted.shift()!;
      this.proposals.delete(id);
    }
  }
}
