import { ProtocolError } from "../contracts/v1/errors.js";
import { JobRequest } from "../contracts/v1/jobs.js";
import type { JobRequest as JobRequestType } from "../contracts/v1/jobs.js";
import type { HelperIdentity } from "../contracts/v1/pairing.js";
import { SCHEMA_VERSION } from "../contracts/v1/common.js";
import type { HelperConfig } from "../config/helper-config.js";
import { TechnicianNoteInput, CustomerUpdateInput } from "../contracts/v1/jobs.js";

export interface JobValidationContext {
  identity: HelperIdentity;
  config: HelperConfig;
}

export function validateJobRequest(raw: unknown, ctx: JobValidationContext): JobRequestType {
  if (typeof raw === "object" && raw !== null && "schemaVersion" in raw) {
    const sv = (raw as { schemaVersion: unknown }).schemaVersion;
    if (sv !== SCHEMA_VERSION) {
      throw new ProtocolError("schema_version_unsupported", `Unsupported schemaVersion: ${String(sv)}`, false);
    }
  }

  const byteLength = Buffer.byteLength(JSON.stringify(raw), "utf8");
  if (byteLength > ctx.config.maxRequestBytes) {
    throw new ProtocolError("request_too_large", `Request ${byteLength}B exceeds ${ctx.config.maxRequestBytes}B`, false);
  }

  const parsed = JobRequest.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path.join(".") === "input.technicianNote") {
      throw new ProtocolError("request_too_large", "Technician note exceeds allowed length.", false);
    }
    throw new ProtocolError("validation_failed", `Job validation failed: ${issue?.path.join(".")} ${issue?.message}`, false);
  }
  const job = parsed.data;

  if (job.assignedHelperId !== ctx.identity.helperId) {
    throw new ProtocolError("helper_assignment_mismatch", "Job is not assigned to this Helper.", false);
  }
  if (job.organizationId !== ctx.identity.organizationId) {
    throw new ProtocolError("organization_mismatch", "Job organization does not match Helper organization.", false);
  }
  if (ctx.identity.locationId && job.locationId && job.locationId !== ctx.identity.locationId) {
    throw new ProtocolError("location_mismatch", "Job location does not match Helper location.", false);
  }

  const now = Date.now();
  const expiresAt = Date.parse(job.expiresAt);
  if (Number.isNaN(expiresAt)) {
    throw new ProtocolError("validation_failed", "expiresAt is not a valid timestamp.", false);
  }
  if (expiresAt <= now) {
    throw new ProtocolError("request_expired", "Job has expired.", false);
  }

  // Validate input based on task type
  if (job.task === 'format_technician_note') {
    const inputResult = TechnicianNoteInput.safeParse(job.input);
    if (!inputResult.success) {
      const issue = inputResult.error.issues[0];
      const code = issue?.path.join('.').includes('technicianNote') ? 'request_too_large' : 'validation_failed';
      throw new ProtocolError(code, `Invalid technician-note input: ${issue?.message}`, false);
    }
    job.input = inputResult.data;
  } else if (job.task === 'draft_customer_update') {
    const inputResult = CustomerUpdateInput.safeParse(job.input);
    if (!inputResult.success) {
      throw new ProtocolError('validation_failed', `Invalid customer-update input: ${inputResult.error.issues[0]?.message}`, false);
    }
    job.input = inputResult.data;
  }

  return job;
}

export function assertNoArbitraryPromptFields(raw: unknown): void {
  if (typeof raw !== "object" || raw === null) return;
  const obj = raw as Record<string, unknown>;
  const forbidden = [
    "systemPrompt",
    "system_prompt",
    "ollamaUrl",
    "ollama_url",
    "model",
    "modelName",
    "model_name",
    "shell",
    "shellCommand",
    "filePath",
    "file_path",
    "tools",
    "toolCalls",
    "tool_calls",
    "code"
  ];
  for (const key of forbidden) {
    if (key in obj) {
      throw new ProtocolError("arbitrary_prompt_rejected", `Job must not supply '${key}'.`, false);
    }
  }
}
