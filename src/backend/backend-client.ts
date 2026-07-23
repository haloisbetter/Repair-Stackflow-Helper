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
import type { CustomerMatchRequest, CustomerMatch, DeviceMatchRequest, DeviceMatch, CheckInProposalSubmission, CheckInSubmissionAck } from "../checkin/checkin-matching-contract.js";

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
  searchCustomerMatches(request: CustomerMatchRequest): Promise<{ matches: CustomerMatch[] }>;
  searchDeviceMatches(request: DeviceMatchRequest): Promise<{ matches: DeviceMatch[] }>;
  submitCheckInProposal(submission: CheckInProposalSubmission): Promise<CheckInSubmissionAck>;
}

export type BackendClientFactory = (config: BackendClientConfig, getToken: () => string | null) => BackendClient;
