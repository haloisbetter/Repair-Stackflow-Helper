import { ProtocolError } from "../../contracts/v1/errors.js";
import { FormatTechnicianNoteOutput } from "./contract.js";
import type { FormatTechnicianNoteOutput as Output } from "./contract.js";

export interface ValidationResult {
  ok: boolean;
  output?: Output;
}

export function validateStructuredOutput(rawContent: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new ProtocolError("malformed_ai_output", "AI response was not valid JSON.", false);
  }
  const result = FormatTechnicianNoteOutput.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const code =
      issue?.code === "unrecognized_keys" ? "unexpected_output_field" : "validation_failed";
    throw new ProtocolError(
      code,
      `Structured output validation failed: ${issue?.path.join(".")} ${issue?.message}`,
      false
    );
  }
  return { ok: true, output: result.data };
}
