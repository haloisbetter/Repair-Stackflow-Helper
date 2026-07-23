/**
 * Job claim and lease loop for production mode.
 * Claims approved jobs from the backend, executes them through JobRunner,
 * and submits results. One active job at a time.
 */
import type { BackendClient } from "../backend/backend-client.js";
import type { HelperStateMachine, JobLifecycleState } from "./state-machines.js";
import { JobStateMachine } from "./state-machines.js";
import type { HeartbeatService } from "./heartbeat-service.js";
import type { ClaimedJob, ResultSubmission, FailureSubmission, FailureCategory } from "../contracts/v1/protocol.js";
import { PROTOCOL_VERSION } from "../contracts/v1/protocol.js";
import type { PendingSubmissionStore } from "./pending-submission-store.js";
import type { JobRunner } from "../jobs/job-runner.js";
import type { TaskRegistry } from "../tasks/task-registry.js";
import { SCHEMA_VERSION } from "../contracts/v1/common.js";

export interface ClaimLoopConfig {
  pollingIntervalMs: number;
  leaseRenewalMarginMs: number;
  maxRetryAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export const DEFAULT_CLAIM_LOOP_CONFIG: ClaimLoopConfig = {
  pollingIntervalMs: 10_000,
  leaseRenewalMarginMs: 30_000,
  maxRetryAttempts: 5,
  backoffBaseMs: 2_000,
  backoffMaxMs: 60_000
};

export interface ClaimLoopDeps {
  backendClient: BackendClient;
  helperState: HelperStateMachine;
  heartbeatService: HeartbeatService;
  pendingStore: PendingSubmissionStore;
  jobRunner: JobRunner;
  taskRegistry: TaskRegistry;
  getIdentity: () => { helperId: string; organizationId?: string; locationId?: string; role: string };
  getAssistantProfileVersion: () => number;
  getInstructionProfileVersion: () => number;
  getToolPolicyVersion: () => number;
}

export class ClaimLoop {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private cancelled = false;
  private activeJob: { job: ClaimedJob; stateMachine: JobStateMachine } | null = null;
  private leaseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly config: ClaimLoopConfig;
  private readonly deps: ClaimLoopDeps;
  private consecutiveClaimFailures = 0;

  constructor(deps: ClaimLoopDeps, config: ClaimLoopConfig = DEFAULT_CLAIM_LOOP_CONFIG) {
    this.deps = deps;
    this.config = config;
  }

  get activeJobId(): string | null {
    return this.activeJob?.job.jobId ?? null;
  }

  get activeJobState(): JobLifecycleState | null {
    return this.activeJob?.stateMachine.state ?? null;
  }

  get jobState(): "idle" | "claimed" | "running" | "submitting" {
    if (!this.activeJob) return "idle";
    const s = this.activeJob.stateMachine.state;
    if (s === "claimed" || s === "leased") return "claimed";
    if (s === "running" || s === "validating") return "running";
    if (s === "submitting") return "submitting";
    return "idle";
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;
    this.schedulePoll(0);
  }

  stop(): void {
    this.cancelled = true;
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.leaseTimer) { clearTimeout(this.leaseTimer); this.leaseTimer = null; }
  }

  private schedulePoll(delayMs: number): void {
    if (this.cancelled) return;
    this.timer = setTimeout(() => void this.poll(), delayMs);
  }

  private async poll(): Promise<void> {
    if (this.cancelled || !this.running) return;

    if (!this.deps.helperState.isProcessingCapable()) {
      this.schedulePoll(this.config.pollingIntervalMs);
      return;
    }

    if (this.activeJob) {
      this.schedulePoll(this.config.pollingIntervalMs);
      return;
    }

    // Process pending submissions first
    await this.processPendingSubmissions();

    try {
      const report = this.deps.heartbeatService.buildCapabilityReport();
      const identity = this.deps.getIdentity();
      const response = await this.deps.backendClient.claimJob({
        protocolVersion: PROTOCOL_VERSION,
        helperId: identity.helperId,
        organizationId: identity.organizationId ?? "",
        locationId: identity.locationId ?? "",
        capabilities: report,
        requestedAt: new Date().toISOString()
      });

      this.consecutiveClaimFailures = 0;

      if (response.claimed) {
        await this.executeJob(response.job);
      }
    } catch (e) {
      this.consecutiveClaimFailures++;
      if (this.consecutiveClaimFailures >= 5 && this.deps.helperState.canTransition("degraded")) {
        this.deps.helperState.transition("degraded");
      }
    }

    const delay = this.computeBackoff();
    this.schedulePoll(delay);
  }

  private async executeJob(claimed: ClaimedJob): Promise<void> {
    const identity = this.deps.getIdentity();

    // Validate assignment
    if (claimed.assignedHelperId !== identity.helperId) {
      await this.submitFailure(claimed, "helper_assignment_mismatch", "Job assigned to different helper.");
      return;
    }
    if (claimed.organizationId !== identity.organizationId) {
      await this.submitFailure(claimed, "organization_mismatch", "Organization mismatch.");
      return;
    }
    if (claimed.locationId !== identity.locationId) {
      await this.submitFailure(claimed, "location_mismatch", "Location mismatch.");
      return;
    }
    if (new Date(claimed.expiresAt).getTime() < Date.now()) {
      await this.submitFailure(claimed, "expired_job", "Job has expired.");
      return;
    }

    const taskEntry = this.deps.taskRegistry.resolve(claimed.taskName);
    if (!taskEntry) {
      await this.submitFailure(claimed, "unsupported_task", "Task not implemented.");
      return;
    }

    const jobSm = new JobStateMachine(claimed.jobId, "claimed");
    this.activeJob = { job: claimed, stateMachine: jobSm };
    jobSm.transition("leased");

    this.scheduleLeaseRenewal(claimed);

    try {
      jobSm.transition("running");
      await this.deps.backendClient.reportJobStatus({
        protocolVersion: PROTOCOL_VERSION,
        jobId: claimed.jobId,
        leaseId: claimed.leaseId,
        helperId: identity.helperId,
        status: "running",
        reportedAt: new Date().toISOString()
      }).catch(() => {});

      const rawJob = {
        schemaVersion: SCHEMA_VERSION,
        jobId: claimed.jobId,
        requestId: claimed.requestId,
        task: claimed.taskName,
        organizationId: claimed.organizationId,
        locationId: claimed.locationId,
        assignedHelperId: claimed.assignedHelperId,
        createdAt: claimed.createdAt,
        expiresAt: claimed.expiresAt,
        input: claimed.payload
      };

      const outcome = await this.deps.jobRunner.run({ rawJob });

      if (this.cancelled) return;

      jobSm.transition("validating");
      jobSm.transition("submitting");

      if (outcome.status === "completed" && outcome.result) {
        const submission: ResultSubmission = {
          protocolVersion: PROTOCOL_VERSION,
          jobId: claimed.jobId,
          requestId: claimed.requestId,
          leaseId: claimed.leaseId,
          taskName: claimed.taskName,
          taskVersion: claimed.taskVersion,
          inputSchemaVersion: claimed.inputSchemaVersion,
          outputSchemaVersion: claimed.outputSchemaVersion,
          submissionKey: claimed.submissionKey,
          assistantProfileVersion: this.deps.getAssistantProfileVersion(),
          instructionProfileVersion: this.deps.getInstructionProfileVersion(),
          toolPolicyVersion: this.deps.getToolPolicyVersion(),
          provider: outcome.result.provider as "ollama" | "mock",
          model: outcome.result.model,
          executionTarget: "local_on_this_machine",
          attemptNumber: claimed.attemptNumber,
          durationMs: outcome.result.timing.durationMs,
          mockProviderUsed: outcome.result.provider === "mock",
          outputValid: true,
          output: outcome.result.result as unknown as Record<string, unknown>,
          submittedAt: new Date().toISOString()
        };

        try {
          await this.deps.backendClient.submitResult(submission);
          jobSm.transition("completed");
        } catch {
          await this.deps.pendingStore.enqueue({
            submissionKey: claimed.submissionKey,
            jobId: claimed.jobId,
            type: "result",
            payload: submission,
            enqueuedAt: new Date().toISOString(),
            attemptCount: 0,
            nextRetryAt: new Date(Date.now() + this.config.backoffBaseMs).toISOString()
          });
          jobSm.transition("completed");
        }
      } else {
        const failure = outcome.failure;
        await this.submitFailure(
          claimed,
          this.mapErrorCategory(failure?.errorCode ?? "internal_error"),
          failure?.errorCode ?? "internal_error"
        );
        jobSm.transition("failed");
      }
    } catch (e) {
      if (!jobSm.isTerminal()) {
        jobSm.transition("failed");
      }
      await this.submitFailure(claimed, "internal_error", "Execution failed.").catch(() => {});
    } finally {
      if (this.leaseTimer) { clearTimeout(this.leaseTimer); this.leaseTimer = null; }
      this.activeJob = null;
    }
  }

  private scheduleLeaseRenewal(job: ClaimedJob): void {
    const leasedUntil = new Date(job.leasedUntil).getTime();
    const renewAt = leasedUntil - this.config.leaseRenewalMarginMs;
    const delay = Math.max(0, renewAt - Date.now());

    this.leaseTimer = setTimeout(async () => {
      if (!this.activeJob || this.activeJob.job.jobId !== job.jobId) return;
      try {
        const response = await this.deps.backendClient.renewLease({
          protocolVersion: PROTOCOL_VERSION,
          jobId: job.jobId,
          leaseId: job.leaseId,
          helperId: this.deps.getIdentity().helperId,
          requestedAt: new Date().toISOString()
        });
        if (response.cancelled) {
          if (this.activeJob?.stateMachine.canTransition("cancelled")) {
            this.activeJob.stateMachine.transition("cancelled");
          }
        } else {
          this.activeJob.job = { ...this.activeJob.job, leasedUntil: response.leasedUntil };
          this.scheduleLeaseRenewal(this.activeJob.job);
        }
      } catch {
        if (this.activeJob?.stateMachine.canTransition("failed")) {
          this.activeJob.stateMachine.transition("failed");
        }
      }
    }, delay);
  }

  private async submitFailure(job: ClaimedJob, category: FailureCategory, message: string): Promise<void> {
    const submission: FailureSubmission = {
      protocolVersion: PROTOCOL_VERSION,
      jobId: job.jobId,
      requestId: job.requestId,
      leaseId: job.leaseId,
      taskName: job.taskName,
      submissionKey: job.submissionKey,
      category,
      errorCode: category,
      sanitizedMessage: message.slice(0, 512),
      retriable: category === "provider_unavailable" || category === "provider_timeout" || category === "temporary_backend_failure",
      attemptNumber: job.attemptNumber,
      failedAt: new Date().toISOString()
    };
    try {
      await this.deps.backendClient.submitFailure(submission);
    } catch {
      await this.deps.pendingStore.enqueue({
        submissionKey: job.submissionKey ?? `failure-${job.jobId}`,
        jobId: job.jobId,
        type: "failure",
        payload: submission,
        enqueuedAt: new Date().toISOString(),
        attemptCount: 0,
        nextRetryAt: new Date(Date.now() + this.config.backoffBaseMs).toISOString()
      });
    }
  }

  private async processPendingSubmissions(): Promise<void> {
    const pending = await this.deps.pendingStore.listPending(5);
    for (const item of pending) {
      if (item.attemptCount >= this.config.maxRetryAttempts) {
        await this.deps.pendingStore.markDeadLetter(item.submissionKey);
        continue;
      }
      if (new Date(item.nextRetryAt).getTime() > Date.now()) continue;
      try {
        if (item.type === "result") {
          await this.deps.backendClient.submitResult(item.payload as ResultSubmission);
        } else {
          await this.deps.backendClient.submitFailure(item.payload as FailureSubmission);
        }
        await this.deps.pendingStore.markAcknowledged(item.submissionKey);
      } catch {
        await this.deps.pendingStore.markAttempt(item.submissionKey);
      }
    }
  }

  private mapErrorCategory(errorCode: string): FailureCategory {
    const map: Record<string, FailureCategory> = {
      ai_target_unreachable: "provider_unavailable",
      model_unavailable: "model_unavailable",
      malformed_ai_output: "invalid_model_output",
      validation_failed: "invalid_job",
      helper_assignment_mismatch: "helper_assignment_mismatch",
      organization_mismatch: "organization_mismatch",
      location_mismatch: "location_mismatch",
      request_expired: "expired_job",
      tool_disabled_by_policy: "unauthorized_tool",
      task_not_enabled: "unsupported_task",
      task_not_approved_in_v1: "unsupported_task",
      schema_version_unsupported: "unsupported_protocol"
    };
    return map[errorCode] ?? "internal_error";
  }

  private computeBackoff(): number {
    if (this.consecutiveClaimFailures === 0) return this.config.pollingIntervalMs;
    const delay = Math.min(
      this.config.backoffBaseMs * Math.pow(2, this.consecutiveClaimFailures - 1),
      this.config.backoffMaxMs
    );
    return delay;
  }
}
