import { FormatTechnicianNoteOutput } from "./contract.js";
import { ProtocolError } from "../../contracts/v1/errors.js";

export interface ValidationResult {
  ok: boolean;
  output: FormatTechnicianNoteOutput | null;
}

export function validateStructuredOutput(rawContent: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new ProtocolError("malformed_ai_output", "AI output was not valid JSON.", false);
  }

  const result = FormatTechnicianNoteOutput.safeParse(parsed);
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

export function detectProhibitedContent(output: FormatTechnicianNoteOutput): string[] {
  const violations: string[] = [];
  const allText = [
    output.formattedNote,
    output.customerReportedIssue,
    ...output.technicianFindings,
    ...output.workPerformed,
    ...output.recommendations,
    output.recommendedNextStep
  ].join(" ").toLowerCase();

  if (/\bpasscode\b/.test(allText)) violations.push("passcode_in_output");
  if (/\bpassword\b/.test(allText)) violations.push("password_in_output");
  if (/\bauthorization\s+token\b/.test(allText)) violations.push("credential_in_output");

  return violations;
}
