import { ProtocolError } from "../contracts/v1/errors.js";
import type { AIProvider } from "../ai/ai-provider.js";
import type { ApprovedAIExecutionRequest } from "../ai/ai-provider.js";
import type { HelperConfig } from "../config/helper-config.js";
import type { HelperIdentity } from "../contracts/v1/pairing.js";
import type { JobRequest } from "../contracts/v1/jobs.js";
import type { JobResultSubmission } from "../contracts/v1/results.js";
import type { JobFailureSubmission } from "../contracts/v1/results.js";
import type { TaskRegistry } from "../tasks/task-registry.js";
import { computeIdempotencyKey, resolveSubmissionKey } from "./idempotency-service.js";
import { TemporaryJobStore } from "./temporary-job-store.js";
import { validateJobRequest, assertNoArbitraryPromptFields } from "./job-validator.js";
import { normalizeOutput as normalizeTechnicianNote } from "../tasks/format-technician-note/formatter.js";
import { validateStructuredOutput as validateTechnicianNote } from "../tasks/format-technician-note/response-validator.js";
import { detectProhibitedContent as detectTechnicianNoteProhibited } from "../tasks/format-technician-note/response-validator.js";
import { normalizeOutput as normalizeCustomerUpdate } from "../tasks/draft-customer-update/formatter.js";
import { validateCustomerUpdateOutput, detectProhibitedContent as detectCustomerUpdateProhibited } from "../tasks/draft-customer-update/response-validator.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { ToolPolicy, AuthorizationDecision } from "../tools/tool-authorization-service.js";
import { authorizeToolUse } from "../tools/tool-authorization-service.js";
import type { AssistantProfileService } from "../assistant/assistant-profile-service.js";
import { composePrompt, composeInstructionBlock } from "../assistant/prompt-composer.js";
import type { TemporaryProposalStore } from "../review/temporary-proposal-store.js";
import {
  FORMAT_TECHNICIAN_NOTE_TASK_VERSION,
  FORMAT_TECHNICIAN_NOTE_INPUT_SCHEMA_VERSION,
  FORMAT_TECHNICIAN_NOTE_OUTPUT_SCHEMA_VERSION,
  FORMAT_TECHNICIAN_NOTE_PROMPT_VERSION
} from "../tasks/format-technician-note/contract.js";
import {
  DRAFT_CUSTOMER_UPDATE_TASK_VERSION,
  DRAFT_CUSTOMER_UPDATE_INPUT_SCHEMA_VERSION,
  DRAFT_CUSTOMER_UPDATE_OUTPUT_SCHEMA_VERSION,
  DRAFT_CUSTOMER_UPDATE_PROMPT_VERSION
} from "../tasks/draft-customer-update/contract.js";

export interface JobRunnerDeps {
  identity: HelperIdentity;
  config: HelperConfig;
  provider: AIProvider;
  taskRegistry: TaskRegistry;
  store: TemporaryJobStore;
  toolRegistry: ToolRegistry;
  enabledTools: () => readonly string[];
  getToolPolicy: (toolId: string) => ToolPolicy | null;
  assistantProfileService: AssistantProfileService;
  proposalStore: TemporaryProposalStore;
  now?: () => Date;
}

export interface RunJobInput {
  rawJob: unknown;
  submissionKey?: string | null;
  attemptNumber?: number;
}

export interface JobRunnerResult {
  status: "completed" | "failed";
  result?: JobResultSubmission;
  failure?: JobFailureSubmission;
  proposalId?: string;
}

function isPaired(identity: HelperIdentity): boolean {
  return identity.pairingState === "paired_ready" || identity.pairingState === "processing";
}

export class JobRunner {
  constructor(private readonly deps: JobRunnerDeps) {}

  async run(input: RunJobInput): Promise<JobRunnerResult> {
    const { identity, config, provider, taskRegistry, store, toolRegistry, assistantProfileService, proposalStore } = this.deps;
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

    const policy = this.deps.getToolPolicy(job.task);
    if (!policy) {
      throw new ProtocolError("tool_disabled_by_policy", `No tool policy for task '${job.task}'.`, false);
    }
    const decision: AuthorizationDecision = authorizeToolUse({
      toolId: job.task,
      role: identity.role as "workstation_agent" | "ai_host" | "combined",
      toolRegistry,
      enabledTools: this.deps.enabledTools(),
      policy,
      confirmationProvided: true
    });
    if (!decision.authorized) {
      throw new ProtocolError(
        decision.errorCode ?? "tool_not_authorized",
        decision.reason ?? `Tool authorization denied for '${job.task}'.`,
        false
      );
    }

    store.beginJob({
      jobId: job.jobId,
      requestId: job.requestId,
      task: job.task,
      technicianNote: (job.input as { technicianNote?: string }).technicianNote ?? ""
    });

    const startedAt = now();
    try {
      const health = await provider.healthCheck();
      if (health.status !== "available") {
        throw new ProtocolError(
          "ai_target_unreachable",
          `AI target ${health.status}: ${health.detail ?? "unavailable"}`,
          true
        );
      }
      const modelCheck = await provider.checkModel(config.approvedModel);
      if (!modelCheck.available) {
        throw new ProtocolError("model_unavailable", `Model '${config.approvedModel}' is not available.`, true);
      }

      const userPrompt = entry.template.renderUserPrompt(job.input as never);
      const instructions = assistantProfileService.getInstructionProfile();
      const assistantProfile = assistantProfileService.getAssistantProfile();

      const outputSchemaHint = job.task === "format_technician_note"
        ? "Return ONLY a JSON object with: formattedNote, customerReportedIssue, technicianFindings, workPerformed, unresolvedIssues, recommendations, warnings, uncertainStatements, omittedSensitiveContent, sourceFactsUsed, sourceFactsExcluded, recommendedNextStep."
        : "Return ONLY a JSON object with: customerFacingDraft, subjectLine, communicationChannel, confirmedFactsUsed, factsExcluded, requiredCustomerAction, nextStep, warnings, uncertainOrMissingInformation, prohibitedClaimsAvoided.";

      const composedSystemPrompt = composePrompt({
        platformSafety: "You are running in a sandboxed repair-shop assistant. Do not execute code, access the filesystem, or make network requests.",
        trustedTask: entry.template.systemPrompt,
        organizationInstructions: composeInstructionBlock(instructions),
        untrustedInput: userPrompt,
        outputSchema: outputSchemaHint
      });

      const execReq: ApprovedAIExecutionRequest = {
        task: job.task as "format_technician_note" | "draft_customer_update",
        systemPrompt: composedSystemPrompt,
        userPrompt,
        model: config.approvedModel,
        maxResponseBytes: config.maxResponseBytes,
        timeoutMs: config.requestTimeoutMs,
        responseFormat: "json"
      };
      const aiResult = await provider.execute(execReq);

      let normalizedResult: Record<string, unknown>;
      if (job.task === "format_technician_note") {
        const validated = validateTechnicianNote(aiResult.rawContent);
        if (!validated.ok || !validated.output) {
          throw new ProtocolError("validation_failed", "Structured output validation failed.", false);
        }
        const prohibited = detectTechnicianNoteProhibited(validated.output);
        if (prohibited.length > 0) {
          throw new ProtocolError("validation_failed", `Prohibited content detected: ${prohibited.join(", ")}`, false);
        }
        normalizedResult = normalizeTechnicianNote(validated.output) as unknown as Record<string, unknown>;
      } else if (job.task === "draft_customer_update") {
        const validated = validateCustomerUpdateOutput(aiResult.rawContent);
        if (!validated.ok || !validated.output) {
          throw new ProtocolError("validation_failed", "Structured output validation failed.", false);
        }
        const prohibited = detectCustomerUpdateProhibited(validated.output);
        if (prohibited.length > 0) {
          throw new ProtocolError("validation_failed", `Prohibited content detected: ${prohibited.join(", ")}`, false);
        }
        normalizedResult = normalizeCustomerUpdate(validated.output) as unknown as Record<string, unknown>;
      } else {
        throw new ProtocolError("task_not_enabled", `Task '${job.task}' is not supported.`, false);
      }

      const completedAt = now();
      const idempotencyKey = resolveSubmissionKey(input.submissionKey ?? null, {
        schemaVersion: job.schemaVersion,
        jobId: job.jobId,
        requestId: job.requestId,
        task: job.task
      });

      const attemptNumber = input.attemptNumber ?? proposalStore.getNextAttemptNumber(job.jobId);
      const taskVersion = job.task === "format_technician_note" ? FORMAT_TECHNICIAN_NOTE_TASK_VERSION : DRAFT_CUSTOMER_UPDATE_TASK_VERSION;
      const inputSchemaVersion = job.task === "format_technician_note" ? FORMAT_TECHNICIAN_NOTE_INPUT_SCHEMA_VERSION : DRAFT_CUSTOMER_UPDATE_INPUT_SCHEMA_VERSION;
      const outputSchemaVersion = job.task === "format_technician_note" ? FORMAT_TECHNICIAN_NOTE_OUTPUT_SCHEMA_VERSION : DRAFT_CUSTOMER_UPDATE_OUTPUT_SCHEMA_VERSION;
      const promptVersion = entry.template.promptVersion;

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
        model: aiResult.model,
        result: normalizedResult as never,
        timing: {
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: completedAt.getTime() - startedAt.getTime()
        }
      };

      store.completeJob(result);

      const proposal = proposalStore.create({
        jobId: job.jobId,
        requestId: job.requestId,
        taskName: job.task,
        taskVersion,
        inputSchemaVersion,
        outputSchemaVersion,
        promptTemplateVersion: promptVersion,
        submissionKey: idempotencyKey,
        attemptNumber,
        previousProposalId: null,
        proposedResult: normalizedResult,
        provenance: {
          provider: provider.name,
          model: aiResult.model,
          executionTarget: config.executionTarget,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          mockProviderUsed: provider.name === "mock",
          assistantProfileVersion: assistantProfile.profileVersion,
          instructionProfileVersion: instructions.profileVersion,
          toolPolicyVersion: 1
        }
      });

      return { status: "completed", result, proposalId: proposal.proposalId };
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
