import { randomUUID } from "node:crypto";
import type { GuidedCheckInSession, TranscriptSegment, ExtractedFieldValue, FieldConflict, CheckInSessionState, ConsentStatus } from "./checkin-contract.js";
import { canTransitionCheckIn, isCheckInTerminal } from "./checkin-contract.js";

const MAX_SESSIONS = 16;
const MAX_TRANSCRIPT_SEGMENTS = 500;
const MAX_TRANSCRIPT_BYTES = 256 * 1024;
const SESSION_TTL_MS = 60 * 60 * 1000;

export interface CreateSessionInput {
  organizationId: string;
  locationId?: string | undefined;
  employeeId?: string | null;
}

export class TemporaryCheckInStore {
  private sessions = new Map<string, GuidedCheckInSession>();

  create(input: CreateSessionInput): GuidedCheckInSession {
    const now = new Date();
    const session: GuidedCheckInSession = {
      sessionId: randomUUID(),
      organizationId: input.organizationId,
      locationId: input.locationId,
      employeeId: input.employeeId ?? null,
      state: "created",
      consentStatus: "not_requested",
      consentRecordedAt: null,
      captureStartedAt: null,
      captureStoppedAt: null,
      transcriptSegments: [],
      extractedFields: [],
      fieldConflicts: [],
      missingFields: [],
      employeeCorrections: [],
      symptomSummaryProposal: null,
      reviewStatus: null,
      proposalId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString()
    };
    this.sessions.set(session.sessionId, session);
    this.enforceBounds();
    return session;
  }

  get(sessionId: string): GuidedCheckInSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (this.isExpired(session)) {
      const expired = { ...session, state: "expired" as CheckInSessionState };
      this.sessions.set(sessionId, expired);
      this.sessions.delete(sessionId);
      return expired;
    }
    return session;
  }

  getActive(): GuidedCheckInSession | null {
    this.expireOld();
    return Array.from(this.sessions.values())
      .find((s) => !isCheckInTerminal(s.state) && s.state !== "expired") ?? null;
  }

  updateState(sessionId: string, newState: CheckInSessionState): GuidedCheckInSession {
    const session = this.get(sessionId);
    if (!session) throw new Error("Session not found or expired.");
    if (isCheckInTerminal(session.state)) {
      throw new Error(`Session is in terminal state: ${session.state}`);
    }
    if (!canTransitionCheckIn(session.state, newState)) {
      throw new Error(`Invalid transition: ${session.state} → ${newState}`);
    }
    const updated = { ...session, state: newState, updatedAt: new Date().toISOString() };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  setConsent(sessionId: string, consent: ConsentStatus): GuidedCheckInSession {
    const session = this.get(sessionId);
    if (!session) throw new Error("Session not found or expired.");
    const updated: GuidedCheckInSession = {
      ...session,
      consentStatus: consent,
      consentRecordedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  addTranscriptSegments(sessionId: string, segments: TranscriptSegment[]): GuidedCheckInSession {
    const session = this.get(sessionId);
    if (!session) throw new Error("Session not found or expired.");
    const existing = session.transcriptSegments;
    const newSegs = [...existing, ...segments].slice(0, MAX_TRANSCRIPT_SEGMENTS);
    const totalBytes = newSegs.reduce((sum, s) => sum + Buffer.byteLength(s.text, "utf8"), 0);
    if (totalBytes > MAX_TRANSCRIPT_BYTES) {
      throw new Error("Transcript exceeds maximum byte limit.");
    }
    const updated = { ...session, transcriptSegments: newSegs, updatedAt: new Date().toISOString() };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  setExtractedFields(sessionId: string, fields: ExtractedFieldValue[]): GuidedCheckInSession {
    const session = this.get(sessionId);
    if (!session) throw new Error("Session not found or expired.");
    const updated = { ...session, extractedFields: fields, updatedAt: new Date().toISOString() };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  setFieldConflicts(sessionId: string, conflicts: FieldConflict[]): GuidedCheckInSession {
    const session = this.get(sessionId);
    if (!session) throw new Error("Session not found or expired.");
    const updated = { ...session, fieldConflicts: conflicts, updatedAt: new Date().toISOString() };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  setMissingFields(sessionId: string, missing: string[]): GuidedCheckInSession {
    const session = this.get(sessionId);
    if (!session) throw new Error("Session not found or expired.");
    const updated = { ...session, missingFields: missing, updatedAt: new Date().toISOString() };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  setSymptomSummary(sessionId: string, summary: Record<string, unknown>): GuidedCheckInSession {
    const session = this.get(sessionId);
    if (!session) throw new Error("Session not found or expired.");
    const updated = { ...session, symptomSummaryProposal: summary, updatedAt: new Date().toISOString() };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  setReviewStatus(sessionId: string, reviewStatus: GuidedCheckInSession["reviewStatus"], proposalId?: string): GuidedCheckInSession {
    const session = this.get(sessionId);
    if (!session) throw new Error("Session not found or expired.");
    const updated = {
      ...session,
      reviewStatus,
      proposalId: proposalId ?? session.proposalId,
      updatedAt: new Date().toISOString()
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  addEmployeeCorrection(sessionId: string, field: string, previousValue: unknown, newValue: unknown): GuidedCheckInSession {
    const session = this.get(sessionId);
    if (!session) throw new Error("Session not found or expired.");
    const correction = { field, previousValue, newValue, correctedAt: new Date().toISOString() };
    const updated = {
      ...session,
      employeeCorrections: [...session.employeeCorrections, correction],
      updatedAt: new Date().toISOString()
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  clearAll(): void {
    this.sessions.clear();
  }

  getSessionMetrics(): {
    total: number;
    active: number;
    byState: Record<string, number>;
    byConsent: Record<string, number>;
    totalTranscriptSegments: number;
    totalExtractedFields: number;
    totalConflicts: number;
    reviewPending: number;
    reviewAccepted: number;
    reviewRejected: number;
  } {
    this.expireOld();
    const all = Array.from(this.sessions.values());
    const byState: Record<string, number> = {};
    const byConsent: Record<string, number> = {};
    for (const s of all) {
      byState[s.state] = (byState[s.state] ?? 0) + 1;
      byConsent[s.consentStatus] = (byConsent[s.consentStatus] ?? 0) + 1;
    }
    return {
      total: all.length,
      active: all.filter((s) => !isCheckInTerminal(s.state)).length,
      byState,
      byConsent,
      totalTranscriptSegments: all.reduce((sum, s) => sum + s.transcriptSegments.length, 0),
      totalExtractedFields: all.reduce((sum, s) => sum + s.extractedFields.length, 0),
      totalConflicts: all.reduce((sum, s) => sum + s.fieldConflicts.length, 0),
      reviewPending: all.filter((s) => s.reviewStatus === "pending_review").length,
      reviewAccepted: all.filter((s) => s.reviewStatus === "accepted" || s.reviewStatus === "accepted_with_edits").length,
      reviewRejected: all.filter((s) => s.reviewStatus === "rejected").length
    };
  }

  private isExpired(session: GuidedCheckInSession): boolean {
    return new Date(session.expiresAt).getTime() <= Date.now();
  }

  private expireOld(): void {
    for (const [id, session] of this.sessions) {
      if (this.isExpired(session)) {
        const expired = { ...session, state: "expired" as CheckInSessionState };
        this.sessions.set(id, expired);
        this.sessions.delete(id);
      }
    }
  }

  private enforceBounds(): void {
    if (this.sessions.size <= MAX_SESSIONS) return;
    const sorted = Array.from(this.sessions.entries())
      .sort((a, b) => a[1].createdAt.localeCompare(b[1].createdAt));
    while (this.sessions.size > MAX_SESSIONS && sorted.length > 0) {
      const [id] = sorted.shift()!;
      this.sessions.delete(id);
    }
  }
}

export { MAX_SESSIONS, MAX_TRANSCRIPT_SEGMENTS, MAX_TRANSCRIPT_BYTES, SESSION_TTL_MS };
