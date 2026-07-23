import { z } from "zod";
import { IsoTimestamp, Uuid, OrganizationId, LocationId } from "../contracts/v1/common.js";

export const CHECKIN_SCHEMA_VERSION = "1.0" as const;

export const CheckInSessionState = z.enum([
  "created",
  "awaiting_consent",
  "ready",
  "listening",
  "paused",
  "processing",
  "needs_information",
  "ready_for_review",
  "accepted",
  "rejected",
  "cancelled",
  "expired",
  "error"
]);
export type CheckInSessionState = z.infer<typeof CheckInSessionState>;

export const ConsentStatus = z.enum([
  "not_requested",
  "granted",
  "declined",
  "withdrawn"
]);
export type ConsentStatus = z.infer<typeof ConsentStatus>;

export const FieldConfidence = z.enum([
  "confirmed",
  "stated",
  "inferred",
  "unknown",
  "conflicting"
]);
export type FieldConfidence = z.infer<typeof FieldConfidence>;

export const TranscriptSegment = z.object({
  segmentId: z.string().min(1).max(64),
  text: z.string().min(1).max(4096),
  startTimeMs: z.number().int().nonnegative(),
  endTimeMs: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
  speakerRole: z.enum(["customer", "employee", "unknown"]).default("unknown"),
  provider: z.string().min(1).max(64),
  status: z.enum(["interim", "final"]).default("final")
}).strict();
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;

export const ExtractedFieldValue = z.object({
  field: z.string().min(1).max(128),
  value: z.unknown(),
  confidence: FieldConfidence,
  sourceSegmentIds: z.array(z.string().min(1).max(64)).max(32),
  employeeConfirmed: z.boolean().default(false)
}).strict();
export type ExtractedFieldValue = z.infer<typeof ExtractedFieldValue>;

export const FieldConflict = z.object({
  field: z.string().min(1).max(128),
  values: z.array(z.unknown()).min(2).max(8),
  sourceSegmentIds: z.array(z.string().min(1).max(64)).max(32),
  resolution: z.enum(["unresolved", "override_first", "override_second", "employee_resolved"]).default("unresolved"),
  overrideReason: z.string().max(256).nullable().default(null)
}).strict();
export type FieldConflict = z.infer<typeof FieldConflict>;

export const GuidedCheckInSession = z.object({
  sessionId: Uuid,
  organizationId: OrganizationId,
  locationId: LocationId.optional(),
  employeeId: z.string().min(1).max(128).nullable().default(null),
  state: CheckInSessionState,
  consentStatus: ConsentStatus,
  consentRecordedAt: IsoTimestamp.nullable().default(null),
  captureStartedAt: IsoTimestamp.nullable().default(null),
  captureStoppedAt: IsoTimestamp.nullable().default(null),
  transcriptSegments: z.array(TranscriptSegment).max(500),
  extractedFields: z.array(ExtractedFieldValue).max(200),
  fieldConflicts: z.array(FieldConflict).max(50),
  missingFields: z.array(z.string().min(1).max(128)).max(100),
  employeeCorrections: z.array(z.object({
    field: z.string().min(1).max(128),
    previousValue: z.unknown(),
    newValue: z.unknown(),
    correctedAt: IsoTimestamp
  }).strict()).max(100),
  symptomSummaryProposal: z.record(z.unknown()).nullable().default(null),
  reviewStatus: z.enum(["pending_review", "accepted", "accepted_with_edits", "rejected", "expired"]).nullable().default(null),
  proposalId: Uuid.nullable().default(null),
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
  expiresAt: IsoTimestamp
}).strict();
export type GuidedCheckInSession = z.infer<typeof GuidedCheckInSession>;

const transitions: Record<CheckInSessionState, readonly CheckInSessionState[]> = {
  created: ["awaiting_consent", "cancelled", "error"],
  awaiting_consent: ["ready", "cancelled", "error"],
  ready: ["listening", "needs_information", "ready_for_review", "cancelled", "error"],
  listening: ["paused", "processing", "needs_information", "ready_for_review", "cancelled", "error"],
  paused: ["listening", "processing", "needs_information", "ready_for_review", "cancelled", "error"],
  processing: ["listening", "paused", "needs_information", "ready_for_review", "error"],
  needs_information: ["listening", "ready_for_review", "cancelled", "error"],
  ready_for_review: ["accepted", "rejected", "needs_information", "cancelled", "expired", "error"],
  accepted: [],
  rejected: [],
  cancelled: [],
  expired: [],
  error: ["created", "cancelled"]
};

export const VALID_STATE_TRANSITIONS = transitions;

export function canTransitionCheckIn(from: CheckInSessionState, to: CheckInSessionState): boolean {
  return transitions[from].includes(to);
}

export function isCheckInTerminal(state: CheckInSessionState): boolean {
  return state === "accepted" || state === "rejected" || state === "cancelled" || state === "expired";
}

export function canCaptureAudio(session: Pick<GuidedCheckInSession, "state" | "consentStatus">): boolean {
  return session.consentStatus === "granted" &&
    (session.state === "listening" || session.state === "paused" || session.state === "ready");
}
