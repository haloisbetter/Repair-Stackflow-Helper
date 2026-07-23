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
import type { CustomerMatchRequest, CustomerMatch, DeviceMatchRequest, DeviceMatch, CheckInProposalSubmission, CheckInSubmissionAck } from "../checkin/checkin-matching-contract.js";

export class ProductionBackendClient implements BackendClient {
  readonly mode = "production" as const;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly getToken: () => string | null;

  constructor(config: BackendClientConfig, getToken: () => string | null) {
    if (config.mode === "production" && !config.baseUrl.startsWith("https://")) {
      throw new Error("Production backend requires HTTPS URL.");
    }
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs;
    this.getToken = getToken;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.getToken();
    if (!token) {
      throw new ProtocolError("credential_revoked", "No credential available.", false);
    }
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "X-Protocol-Version": PROTOCOL_VERSION
    };
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
      signal: AbortSignal.timeout(this.timeoutMs)
    }).catch((e) => {
      if (e instanceof DOMException && e.name === "TimeoutError") {
        throw new ProtocolError("ai_target_unreachable", "Backend request timed out.", true);
      }
      throw new ProtocolError("ai_target_unreachable", "Backend unreachable.", true);
    });

    if (res.status === 401) {
      throw new ProtocolError("credential_revoked", "Credential rejected by backend.", false);
    }
    if (res.status === 409) {
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new ProtocolError("active_job_conflict", String(data.message ?? "Conflict"), false);
    }
    if (res.status === 410) {
      throw new ProtocolError("pairing_code_expired", "Resource gone.", false);
    }
    if (res.status === 426) {
      throw new ProtocolError("schema_version_unsupported", "Protocol upgrade required.", false);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const retriable = res.status >= 500;
      throw new ProtocolError(
        retriable ? "ai_target_unreachable" : "validation_failed",
        `Backend HTTP ${res.status}: ${text.slice(0, 200)}`,
        retriable
      );
    }
    return (await res.json()) as T;
  }

  async exchangePairingCode(request: PairingRequest): Promise<PairingResponse> {
    return this.request<PairingResponse>("POST", "/api/v1/helper/pair", request);
  }

  async revokeCredential(helperId: string): Promise<void> {
    await this.request<unknown>("POST", "/api/v1/helper/unpair", { helperId });
  }

  async sendHeartbeat(request: HeartbeatRequest): Promise<BackendAcknowledgment> {
    return this.request<BackendAcknowledgment>("POST", "/api/v1/helper/heartbeat", request);
  }

  async reportCapabilities(report: CapabilityReport): Promise<BackendAcknowledgment> {
    return this.request<BackendAcknowledgment>("POST", "/api/v1/helper/capabilities", report);
  }

  async claimJob(request: JobClaimRequest): Promise<JobClaimResponse> {
    return this.request<JobClaimResponse>("POST", "/api/v1/helper/jobs/claim", request);
  }

  async renewLease(request: LeaseRenewalRequest): Promise<LeaseRenewalResponse> {
    return this.request<LeaseRenewalResponse>("POST", "/api/v1/helper/jobs/lease/renew", request);
  }

  async reportJobStatus(update: JobStatusUpdate): Promise<BackendAcknowledgment> {
    return this.request<BackendAcknowledgment>("POST", "/api/v1/helper/jobs/status", update);
  }

  async submitResult(submission: ResultSubmission): Promise<SubmissionAcknowledgment> {
    return this.request<SubmissionAcknowledgment>("POST", "/api/v1/helper/jobs/result", submission);
  }

  async submitFailure(submission: FailureSubmission): Promise<BackendAcknowledgment> {
    return this.request<BackendAcknowledgment>("POST", "/api/v1/helper/jobs/failure", submission);
  }

  async acknowledgeCancellation(ack: CancellationAcknowledgment): Promise<BackendAcknowledgment> {
    return this.request<BackendAcknowledgment>("POST", "/api/v1/helper/jobs/cancellation", ack);
  }

  async searchCustomerMatches(request: CustomerMatchRequest): Promise<{ matches: CustomerMatch[] }> {
    return this.request<{ matches: CustomerMatch[] }>("POST", "/api/v1/customers/search", request);
  }

  async searchDeviceMatches(request: DeviceMatchRequest): Promise<{ matches: DeviceMatch[] }> {
    return this.request<{ matches: DeviceMatch[] }>("POST", "/api/v1/devices/search", request);
  }

  async submitCheckInProposal(submission: CheckInProposalSubmission): Promise<CheckInSubmissionAck> {
    return this.request<CheckInSubmissionAck>("POST", "/api/v1/checkin/proposals", submission);
  }
}
