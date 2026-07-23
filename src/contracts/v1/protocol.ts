/**
 * Production protocol contracts for Helper <-> Repair StackFlow backend communication.
 * All schemas are strict (no extra fields). All timestamps are ISO 8601 with UTC offset.
 */
import { z } from "zod";
import {
  SCHEMA_VERSION,
  IsoTimestamp,
  Uuid,
  HelperId,
  OrganizationId,
  LocationId
} from "./common.js";

export const PROTOCOL_VERSION = "1.0" as const;

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

export const ProtocolVersion = z.literal(PROTOCOL_VERSION);

export const HelperRoleSchema = z.enum(["workstation_agent", "ai_host", "combined"]);
export type HelperRole = z.infer<typeof HelperRoleSchema>;

const TokenString = z.string().min(16).max(2048);
const ShortString = z.string().min(1).max(128);
const CapabilityId = z.string().min(1).max(64).regex(/^[a-z0-9_]+$/);

// ---------------------------------------------------------------------------
// 1. Pairing request
// ---------------------------------------------------------------------------

export const PairingRequest = z.object({
  protocolVersion: ProtocolVersion,
  pairingCode: z.string().min(4).max(64),
  helperId: HelperId,
  appVersion: ShortString,
  platform: ShortString,
  architecture: ShortString,
  role: HelperRoleSchema,
  requestedAt: IsoTimestamp
}).strict();
export type PairingRequest = z.infer<typeof PairingRequest>;

// ---------------------------------------------------------------------------
// 2. Pairing response
// ---------------------------------------------------------------------------

export const PairingResponse = z.object({
  protocolVersion: ProtocolVersion,
  helperId: HelperId,
  organizationId: OrganizationId,
  organizationName: ShortString,
  locationId: LocationId,
  locationName: ShortString,
  role: HelperRoleSchema,
  credentialToken: TokenString,
  credentialIssuedAt: IsoTimestamp,
  credentialExpiresAt: IsoTimestamp,
  pairedAt: IsoTimestamp
}).strict();
export type PairingResponse = z.infer<typeof PairingResponse>;

// ---------------------------------------------------------------------------
// 3. Device credential metadata (stored, token excluded)
// ---------------------------------------------------------------------------

export const DeviceCredentialMetadata = z.object({
  helperId: HelperId,
  organizationId: OrganizationId,
  locationId: LocationId,
  role: HelperRoleSchema,
  issuedAt: IsoTimestamp,
  expiresAt: IsoTimestamp,
  revokedAt: IsoTimestamp.nullable(),
  capabilities: z.array(CapabilityId).max(64)
}).strict();
export type DeviceCredentialMetadata = z.infer<typeof DeviceCredentialMetadata>;

// ---------------------------------------------------------------------------
// 4. Helper heartbeat request
// ---------------------------------------------------------------------------

export const HeartbeatProviderStatus = z.object({
  provider: z.enum(["ollama", "mock", "none"]),
  status: z.enum(["available", "degraded", "unavailable", "timed_out", "misconfigured", "unknown"]),
  modelAvailable: z.boolean(),
  latencyMs: z.number().int().nonnegative().nullable()
}).strict();

export const HeartbeatRequest = z.object({
  protocolVersion: ProtocolVersion,
  helperId: HelperId,
  organizationId: OrganizationId,
  locationId: LocationId,
  appVersion: ShortString,
  runtimeMode: z.enum(["development", "production"]),
  role: HelperRoleSchema,
  platform: ShortString,
  architecture: ShortString,
  activeProvider: HeartbeatProviderStatus,
  implementedTasks: z.array(ShortString).max(32),
  enabledTasks: z.array(ShortString).max(32),
  activeJobId: Uuid.nullable(),
  jobState: z.enum(["idle", "claimed", "running", "submitting"]),
  queueCapacity: z.number().int().nonnegative(),
  pendingSubmissionCount: z.number().int().nonnegative(),
  sentAt: IsoTimestamp
}).strict();
export type HeartbeatRequest = z.infer<typeof HeartbeatRequest>;

// ---------------------------------------------------------------------------
// 5. Heartbeat response / backend acknowledgment
// ---------------------------------------------------------------------------

export const BackendAcknowledgment = z.object({
  protocolVersion: ProtocolVersion,
  receivedAt: IsoTimestamp,
  message: z.string().max(256).optional()
}).strict();
export type BackendAcknowledgment = z.infer<typeof BackendAcknowledgment>;

// ---------------------------------------------------------------------------
// 6. Capability report
// ---------------------------------------------------------------------------

export const CapabilityReport = z.object({
  protocolVersion: ProtocolVersion,
  helperId: HelperId,
  organizationId: OrganizationId,
  locationId: LocationId,
  implementedTasks: z.array(ShortString).max(32),
  enabledTasks: z.array(ShortString).max(32),
  supportedTaskSchemaVersions: z.record(z.string().max(16)).default({}),
  executionTargets: z.array(z.enum(["local_on_this_machine", "remote_store_ai"])).max(4),
  providers: z.array(z.enum(["ollama", "mock"])).max(4),
  models: z.array(ShortString).max(8),
  maxPayloadBytes: z.number().int().positive(),
  maxResponseBytes: z.number().int().positive(),
  reportedAt: IsoTimestamp
}).strict();
export type CapabilityReport = z.infer<typeof CapabilityReport>;

// ---------------------------------------------------------------------------
// 7. Job claim request
// ---------------------------------------------------------------------------

export const JobClaimRequest = z.object({
  protocolVersion: ProtocolVersion,
  helperId: HelperId,
  organizationId: OrganizationId,
  locationId: LocationId,
  capabilities: CapabilityReport,
  requestedAt: IsoTimestamp
}).strict();
export type JobClaimRequest = z.infer<typeof JobClaimRequest>;

// ---------------------------------------------------------------------------
// 8. Claimed job (what the backend sends the Helper)
// ---------------------------------------------------------------------------

export const TaskInputPayload = z.record(z.unknown()).and(
  z.object({}).passthrough()
);

export const ClaimedJob = z.object({
  protocolVersion: ProtocolVersion,
  jobId: Uuid,
  requestId: Uuid,
  taskName: z.string().min(1).max(64),
  taskVersion: z.string().min(1).max(16),
  organizationId: OrganizationId,
  locationId: LocationId,
  assignedHelperId: HelperId,
  requiredCapabilities: z.array(CapabilityId).max(32).default([]),
  createdAt: IsoTimestamp,
  expiresAt: IsoTimestamp,
  leasedUntil: IsoTimestamp,
  leaseId: Uuid,
  inputSchemaVersion: z.string().min(1).max(16),
  outputSchemaVersion: z.string().min(1).max(16),
  payload: z.record(z.unknown()),
  submissionKey: z.string().min(16).max(256),
  attemptNumber: z.number().int().nonnegative().default(0)
}).strict();
export type ClaimedJob = z.infer<typeof ClaimedJob>;

// ---------------------------------------------------------------------------
// 9. Lease renewal request / response
// ---------------------------------------------------------------------------

export const LeaseRenewalRequest = z.object({
  protocolVersion: ProtocolVersion,
  jobId: Uuid,
  leaseId: Uuid,
  helperId: HelperId,
  requestedAt: IsoTimestamp
}).strict();
export type LeaseRenewalRequest = z.infer<typeof LeaseRenewalRequest>;

export const LeaseRenewalResponse = z.object({
  protocolVersion: ProtocolVersion,
  jobId: Uuid,
  leaseId: Uuid,
  leasedUntil: IsoTimestamp,
  cancelled: z.boolean().default(false)
}).strict();
export type LeaseRenewalResponse = z.infer<typeof LeaseRenewalResponse>;

// ---------------------------------------------------------------------------
// 10. Job status update
// ---------------------------------------------------------------------------

export const JobStatusUpdate = z.object({
  protocolVersion: ProtocolVersion,
  jobId: Uuid,
  leaseId: Uuid,
  helperId: HelperId,
  status: z.enum(["running", "validating", "submitting"]),
  reportedAt: IsoTimestamp
}).strict();
export type JobStatusUpdate = z.infer<typeof JobStatusUpdate>;

// ---------------------------------------------------------------------------
// 11. Result submission
// ---------------------------------------------------------------------------

export const ResultSubmission = z.object({
  protocolVersion: ProtocolVersion,
  jobId: Uuid,
  requestId: Uuid,
  leaseId: Uuid,
  taskName: z.string().min(1).max(64),
  taskVersion: z.string().min(1).max(16),
  inputSchemaVersion: z.string().min(1).max(16),
  outputSchemaVersion: z.string().min(1).max(16),
  submissionKey: z.string().min(16).max(256),
  assistantProfileVersion: z.number().int().nonnegative(),
  instructionProfileVersion: z.number().int().nonnegative(),
  toolPolicyVersion: z.number().int().nonnegative(),
  provider: z.enum(["ollama", "mock"]),
  model: z.string().min(1).max(128),
  executionTarget: z.enum(["local_on_this_machine", "remote_store_ai"]),
  attemptNumber: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  mockProviderUsed: z.boolean(),
  outputValid: z.boolean(),
  output: z.record(z.unknown()),
  submittedAt: IsoTimestamp
}).strict();
export type ResultSubmission = z.infer<typeof ResultSubmission>;

// ---------------------------------------------------------------------------
// 12. Failure submission
// ---------------------------------------------------------------------------

export const FailureCategory = z.enum([
  "invalid_job",
  "unsupported_protocol",
  "unsupported_task",
  "unauthorized_tool",
  "organization_mismatch",
  "location_mismatch",
  "helper_assignment_mismatch",
  "expired_job",
  "lease_lost",
  "provider_unavailable",
  "model_unavailable",
  "provider_timeout",
  "invalid_model_output",
  "output_too_large",
  "cancelled",
  "temporary_backend_failure",
  "permanent_backend_failure",
  "internal_error"
]);
export type FailureCategory = z.infer<typeof FailureCategory>;

export const FailureSubmission = z.object({
  protocolVersion: ProtocolVersion,
  jobId: Uuid,
  requestId: Uuid,
  leaseId: Uuid.nullable(),
  taskName: z.string().min(1).max(64),
  submissionKey: z.string().min(16).max(256).nullable(),
  category: FailureCategory,
  errorCode: z.string().min(1).max(64),
  sanitizedMessage: z.string().min(0).max(512),
  retriable: z.boolean(),
  attemptNumber: z.number().int().nonnegative(),
  failedAt: IsoTimestamp
}).strict();
export type FailureSubmission = z.infer<typeof FailureSubmission>;

// ---------------------------------------------------------------------------
// 13. Result submission acknowledgment
// ---------------------------------------------------------------------------

export const SubmissionAcknowledgment = z.object({
  protocolVersion: ProtocolVersion,
  jobId: Uuid,
  submissionKey: z.string().min(16).max(256),
  acknowledgedAt: IsoTimestamp,
  permanentResultId: z.string().min(1).max(128).optional()
}).strict();
export type SubmissionAcknowledgment = z.infer<typeof SubmissionAcknowledgment>;

// ---------------------------------------------------------------------------
// 14. Cancellation acknowledgment
// ---------------------------------------------------------------------------

export const CancellationAcknowledgment = z.object({
  protocolVersion: ProtocolVersion,
  jobId: Uuid,
  cancelledAt: IsoTimestamp,
  reason: z.string().max(256).optional()
}).strict();
export type CancellationAcknowledgment = z.infer<typeof CancellationAcknowledgment>;

// ---------------------------------------------------------------------------
// 15. Protocol compatibility error
// ---------------------------------------------------------------------------

export const ProtocolCompatibilityError = z.object({
  protocolVersion: z.string().max(16),
  minimumRequiredVersion: z.string().max(16),
  maximumSupportedVersion: z.string().max(16),
  message: z.string().max(512)
}).strict();
export type ProtocolCompatibilityError = z.infer<typeof ProtocolCompatibilityError>;

// ---------------------------------------------------------------------------
// Job claim response (discriminated union)
// ---------------------------------------------------------------------------

export const JobClaimResponse = z.discriminatedUnion("claimed", [
  z.object({ claimed: z.literal(true), job: ClaimedJob }).strict(),
  z.object({ claimed: z.literal(false), reason: z.string().max(128), retryAfterMs: z.number().int().nonnegative().optional() }).strict()
]);
export type JobClaimResponse = z.infer<typeof JobClaimResponse>;
