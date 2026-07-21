import { z } from "zod";

export const ErrorCode = z.enum([
  "pairing_code_invalid",
  "pairing_code_expired",
  "credential_revoked",
  "task_not_approved_in_v1",
  "task_not_enabled",
  "schema_version_unsupported",
  "request_too_large",
  "request_expired",
  "ai_target_unreachable",
  "model_unavailable",
  "validation_failed",
  "malformed_ai_output",
  "unexpected_output_field",
  "unsupported_output_style",
  "submission_failed",
  "idempotent_duplicate",
  "helper_unpaired",
  "helper_assignment_mismatch",
  "organization_mismatch",
  "location_mismatch",
  "job_not_found",
  "result_not_found",
  "active_job_conflict",
  "not_configured",
  "arbitrary_prompt_rejected",
  "tool_not_found",
  "tool_not_implemented",
  "tool_not_in_profile",
  "tool_disabled_by_policy",
  "tool_role_not_allowed",
  "tool_location_not_supported",
  "tool_confirmation_required",
  "tool_not_authorized",
  "configuration_not_found",
  "configuration_invalid",
  "configuration_version_unsupported",
  "configuration_read_failed",
  "configuration_write_failed",
  "configuration_backup_loaded",
  "configuration_import_rejected",
  "internal_error"
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorResponse = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string().min(1).max(512),
    retriable: z.boolean()
  })
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

export class ProtocolError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retriable: boolean = false
  ) {
    super(message);
    this.name = "ProtocolError";
  }

  toResponse(): { error: { code: ErrorCode; message: string; retriable: boolean } } {
    return { error: { code: this.code, message: this.message, retriable: this.retriable } };
  }
}

export function isRetryableCode(code: ErrorCode): boolean {
  return code === "ai_target_unreachable" || code === "model_unavailable";
}
