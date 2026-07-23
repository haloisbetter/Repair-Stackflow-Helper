import { DraftCustomerUpdateOutput } from "./contract.js";
import { ProtocolError } from "../../contracts/v1/errors.js";

export interface ValidationResult {
  ok: boolean;
  output: DraftCustomerUpdateOutput | null;
}

export function validateCustomerUpdateOutput(rawContent: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new ProtocolError("malformed_ai_output", "AI output was not valid JSON.", false);
  }

  const result = DraftCustomerUpdateOutput.safeParse(parsed);
  if (result.success) {
    return { ok: true, output: result.data };
  }

  const unrecognized = result.error.issues.find((i) => i.code === "unrecognized_keys");
  if (unrecognized) {
    throw new ProtocolError(
      "unexpected_output_field",
      `Output contained unexpected field: ${unrecognized.keys?.join(", ") ?? "unknown"}`,
      false
    );
  }

  const firstError = result.error.issues[0];
  const message = firstError
    ? `${firstError.path.join(".")}: ${firstError.message}`
    : "Output failed schema validation.";
  throw new ProtocolError("validation_failed", message, false);
}

export function detectProhibitedContent(output: DraftCustomerUpdateOutput): string[] {
  const violations: string[] = [];
  const draftText = output.customerFacingDraft.toLowerCase();

  if (/\bpasscode\b/.test(draftText)) violations.push("passcode_in_draft");
  if (/\bpassword\b/.test(draftText)) violations.push("password_in_draft");
  if (/\bprofit\s+margin\b/.test(draftText)) violations.push("profit_margin_in_draft");
  if (/\binternal\s+cost\b/.test(draftText)) violations.push("internal_cost_in_draft");
  if (/\bvendor\s+credential\b/.test(draftText)) violations.push("vendor_credential_in_draft");

  const draftLower = output.customerFacingDraft.toLowerCase();
  if (/repair\s+is\s+complete/.test(draftLower)) violations.push("unconfirmed_completion_claim");
  if (/diagnosis\s+is\s+(final|confirmed)/.test(draftLower)) violations.push("unconfirmed_diagnosis_claim");
  if (/part\s+(has\s+)?arrived/.test(draftLower)) violations.push("unconfirmed_part_arrival_claim");
  if (/estimate\s+is\s+approved/.test(draftLower)) violations.push("unconfirmed_approval_claim");

  return violations;
}
