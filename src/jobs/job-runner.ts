import { ProtocolError } from "../contracts/v1/errors.js";
import type { AIProvider } from "../ai/ai-provider.js";
import type { ApprovedAIExecutionRequest } from "../ai/ai-provider.js";
import type { HelperConfig } from "../config/helper-config.js";
import type { HelperIdentity } from "../contracts/v1/pairing.js";
import type { JobRequest } from "../contracts/v1/jobs.js";
import type { JobResultSubmission } from "../contracts/v1/results.js";
import type { JobFailureSubmission } from "../contracts/v1/results.js";
import type { TaskRegistry } from "../tasks/task-registry.js";
import { computeIdempotencyKey } from "./idempotency-service.js";
import { TemporaryJobStore } from "./temporary-job-store.js";
import { validateJobRequest, assertNoArbitraryPromptFields } from "./job-validator.js";
import { normalizeOutput } from "../tasks/format-technician-note/formatter.js";
import { validateStructuredOutput } from "../tasks/format-technician-note/response-validator.js";

export interface JobRunnerDeps {
  identity: HelperIdentity;
  config: HelperConfig;
  provider: AIProvider;
  taskRegistry: TaskRegistry;
  store: TemporaryJobStore;
  now?: () => Date;
}

export interface RunJobInput {
  rawJob: unknown;
}

export interface JobRunnerResult {
  status: "completed" | "failed";
  result?: JobResultSubmission;
  failure?: JobFailureSubmission;
}

function isPaired(identity: HelperIdentity): boolean {
  return identity.pairingState === "paired_ready" || identity.pairingState === "processing";
}

export class JobRunner {
  constructor(private readonly deps: JobRunnerDeps) {}

  async run(input: RunJobInput): Promise<JobRunnerResult> {
    const { identity, config, provider, taskRegistry, store } = this.deps;
    const now = this.deps.now ?? (() => new Date());

    if (!isPaired(identity)) {
      throw new ProtocolError("helper_unpaired", "Helper is not paired; cannot run jobs.", false);
    }
    if (store.getActiveJob()) {
      throw new ProtocolError("active_job_conflict", "Another job is already processing.", false);
    }

    assertNoArbitraryPromptFields(input.rawJob);
    const job = validateJobRequest(input.rawJob, { identity, config });

    const entry = taskRegistry.resolve(job.task);
    store.beginJob({
      jobId: job.jobId,
      requestId: job.requestId,
      task: job.task,
      technicianNote: job.input.technicianNote
    });

    const startedAt = now();
    try {
      const health = await provider.healthCheck();
      if (health.status !== "available") {
        throw new ProtocolError(
          health.status === "timed_out" || health.status === "misconfigured" ? "ai_target_unreachable" : "ai_target_unreachable",
          `AI target ${health.status}: ${health.detail ?? "unavailable"}`,
          true
        );
      }
      const modelCheck = await provider.checkModel(config.approvedModel);
      if (!modelCheck.available) {
        throw new ProtocolError("model_unavailable", `Model '${config.approvedModel}' is not available.`, true);
      }

      const userPrompt = entry.template.renderUserPrompt(job.input);
      const execReq: ApprovedAIExecutionRequest = {
        task: "format_technician_note",
        systemPrompt: entry.template.systemPrompt,
        userPrompt,
        model: config.approvedModel,
        maxResponseBytes: config.maxResponseBytes,
        timeoutMs: config.requestTimeoutMs
      };
      const aiResult = await provider.execute(execReq);

      const validated = validateStructuredOutput(aiResult.rawContent);
      if (!validated.ok || !validated.output) {
        throw new ProtocolError("validation_failed", "Structured output validation failed.", false);
      }
      const normalized = normalizeOutput(validated.output);

      const completedAt = now();
      const idempotencyKey = computeIdempotencyKey({
        schemaVersion: job.schemaVersion,
        jobId: job.jobId,
        requestId: job.requestId,
        task: job.task
      });

      const result: JobResultSubmission = {
        schemaVersion: job.schemaVersion,
        jobId: job.jobId,
        requestId: job.requestId,
        helperId: identity.helperId,
        task: job.task,
        status: "completed",
        idempotencyKey,
        provider: provider.name,
        executionTarget: config.executionTarget,
        model: config.approvedModel,
        result: normalized,
        timing: {
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: completedAt.getTime() - startedAt.getTime()
        }
      };

      store.completeJob(result);
      return { status: "completed", result };
    } catch (e) {
      const completedAt = now();
      const code = e instanceof ProtocolError ? e.code : "internal_error";
      const retriable = e instanceof ProtocolError ? e.retriable : false;
      const failure: JobFailureSubmission = {
        schemaVersion: job.schemaVersion,
        jobId: job.jobId,
        requestId: job.requestId,
        helperId: identity.helperId,
        task: job.task,
        errorCode: code,
        retriable,
        at: completedAt.toISOString()
      };
      store.recordFailure(failure);
      return { status: "failed", failure };
    } finally {
      store.clearActive();
    }
  }

  async rerunIfDuplicate(input: RunJobInput): Promise<JobRunnerResult | null> {
    const existing = this.deps.store.getResultByJob(
      (input.rawJob as { jobId?: string })?.jobId ?? ""
    );
    return existing ? { status: "completed", result: existing } : null;
  }
}

export { validateJobRequest, assertNoArbitraryPromptFields };
