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

export interface BackendClientConfig {
  baseUrl: string;
  timeoutMs: number;
  mode: "development" | "production";
}

export interface BackendClient {
  readonly mode: "development" | "production";
  exchangePairingCode(request: PairingRequest): Promise<PairingResponse>;
  revokeCredential(helperId: string): Promise<void>;
  sendHeartbeat(request: HeartbeatRequest): Promise<BackendAcknowledgment>;
  reportCapabilities(report: CapabilityReport): Promise<BackendAcknowledgment>;
  claimJob(request: JobClaimRequest): Promise<JobClaimResponse>;
  renewLease(request: LeaseRenewalRequest): Promise<LeaseRenewalResponse>;
  reportJobStatus(update: JobStatusUpdate): Promise<BackendAcknowledgment>;
  submitResult(submission: ResultSubmission): Promise<SubmissionAcknowledgment>;
  submitFailure(submission: FailureSubmission): Promise<BackendAcknowledgment>;
  acknowledgeCancellation(ack: CancellationAcknowledgment): Promise<BackendAcknowledgment>;
}

export type BackendClientFactory = (config: BackendClientConfig, getToken: () => string | null) => BackendClient;
