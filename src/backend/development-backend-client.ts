import type { BackendClient, BackendClientConfig } from "./backend-client.js";
import type {
  PairingRequest,
  PairingResponse,
  HeartbeatRequest,
  BackendAcknowledgment,
  CapabilityReport,
  JobClaimRequest,
  JobClaimResponse,
  LeaseRenewalRequest,
  LeaseRenewalResponse,
  JobStatusUpdate,
  ResultSubmission,
  SubmissionAcknowledgment,
  FailureSubmission,
  CancellationAcknowledgment
} from "../contracts/v1/protocol.js";
import { PROTOCOL_VERSION } from "../contracts/v1/protocol.js";
import { ProtocolError } from "../contracts/v1/errors.js";

export class DevelopmentBackendClient implements BackendClient {
  readonly mode = "development" as const;

  private pairedOrg: { organizationId: string; organizationName: string; locationId: string; locationName: string; role: "workstation_agent" | "ai_host" | "combined" } | null = null;

  private readonly devCodes = new Map<string, { organizationId: string; organizationName: string; locationId: string; locationName: string; role: "workstation_agent" | "ai_host" | "combined" }>([
    ["DEV-YORKTOWN", { organizationId: "computer-concepts-dev", organizationName: "Computer Concepts (Dev)", locationId: "yorktown-dev", locationName: "Yorktown", role: "combined" }],
    ["DEV-HAMPTON", { organizationId: "computer-concepts-dev", organizationName: "Computer Concepts (Dev)", locationId: "hampton-dev", locationName: "Hampton", role: "workstation_agent" }]
  ]);
  private readonly expiredCodes = new Set(["EXPIRED-CODE-1", "EXPIRED-CODE-2"]);

  async exchangePairingCode(request: PairingRequest): Promise<PairingResponse> {
    if (this.expiredCodes.has(request.pairingCode)) {
      throw new ProtocolError("pairing_code_expired", "Pairing code has expired.", false);
    }
    const match = this.devCodes.get(request.pairingCode);
    if (!match) {
      throw new ProtocolError("pairing_code_invalid", "Unknown pairing code.", false);
    }
    const now = new Date().toISOString();
    this.pairedOrg = match;
    return {
      protocolVersion: PROTOCOL_VERSION,
      helperId: request.helperId,
      organizationId: match.organizationId,
      organizationName: match.organizationName,
      locationId: match.locationId,
      locationName: match.locationName,
      role: match.role,
      credentialToken: `dev-token-${request.helperId.slice(0, 8)}-${Date.now()}`,
      credentialIssuedAt: now,
      credentialExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      pairedAt: now
    };
  }

  async revokeCredential(_helperId: string): Promise<void> {
    this.pairedOrg = null;
  }

  async sendHeartbeat(_request: HeartbeatRequest): Promise<BackendAcknowledgment> {
    return { protocolVersion: PROTOCOL_VERSION, receivedAt: new Date().toISOString() };
  }

  async reportCapabilities(_report: CapabilityReport): Promise<BackendAcknowledgment> {
    return { protocolVersion: PROTOCOL_VERSION, receivedAt: new Date().toISOString() };
  }

  async claimJob(_request: JobClaimRequest): Promise<JobClaimResponse> {
    return { claimed: false, reason: "No jobs available in development mode." };
  }

  async renewLease(request: LeaseRenewalRequest): Promise<LeaseRenewalResponse> {
    return {
      protocolVersion: PROTOCOL_VERSION,
      jobId: request.jobId,
      leaseId: request.leaseId,
      leasedUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      cancelled: false
    };
  }

  async reportJobStatus(_update: JobStatusUpdate): Promise<BackendAcknowledgment> {
    return { protocolVersion: PROTOCOL_VERSION, receivedAt: new Date().toISOString() };
  }

  async submitResult(submission: ResultSubmission): Promise<SubmissionAcknowledgment> {
    return {
      protocolVersion: PROTOCOL_VERSION,
      jobId: submission.jobId,
      submissionKey: submission.submissionKey,
      acknowledgedAt: new Date().toISOString()
    };
  }

  async submitFailure(_submission: FailureSubmission): Promise<BackendAcknowledgment> {
    return { protocolVersion: PROTOCOL_VERSION, receivedAt: new Date().toISOString() };
  }

  async acknowledgeCancellation(_ack: CancellationAcknowledgment): Promise<BackendAcknowledgment> {
    return { protocolVersion: PROTOCOL_VERSION, receivedAt: new Date().toISOString() };
  }
}
