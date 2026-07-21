import type { InstructionProfile } from "./instruction-profile.js";

export interface PromptSegments {
  platformSafety: string;
  trustedTask: string;
  organizationInstructions: string;
  untrustedInput: string;
  outputSchema: string;
}

export interface PromptComposer {
  compose(segments: PromptSegments): string;
  composeInstructionBlock(instructions: InstructionProfile): string;
}

const SECTION_DIVIDER = "\n\n---\n\n";

export function composeInstructionBlock(instructions: InstructionProfile): string {
  const parts: string[] = [];
  parts.push(`GLOBAL INSTRUCTIONS:\n${instructions.globalInstructions}`);

  if (instructions.toneRules.length > 0) {
    parts.push(`TONE RULES:\n${instructions.toneRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`);
  }
  if (instructions.formattingRules.length > 0) {
    parts.push(`FORMATTING RULES:\n${instructions.formattingRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`);
  }
  if (instructions.prohibitedClaims.length > 0) {
    parts.push(`PROHIBITED CLAIMS:\n${instructions.prohibitedClaims.map((r, i) => `${i + 1}. ${r}`).join("\n")}`);
  }
  if (instructions.escalationRules.length > 0) {
    parts.push(`ESCALATION RULES:\n${instructions.escalationRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`);
  }
  return parts.join(SECTION_DIVIDER);
}

export function composePrompt(segments: PromptSegments): string {
  return [
    "===PLATFORM_SAFETY_BEGIN===",
    segments.platformSafety,
    "===PLATFORM_SAFETY_END===",
    "",
    "===TRUSTED_TASK_BEGIN===",
    segments.trustedTask,
    "===TRUSTED_TASK_END===",
    "",
    "===ORGANIZATION_INSTRUCTIONS_BEGIN===",
    segments.organizationInstructions,
    "===ORGANIZATION_INSTRUCTIONS_END===",
    "",
    "===UNTRUSTED_INPUT_BEGIN===",
    segments.untrustedInput,
    "===UNTRUSTED_INPUT_END===",
    "",
    "===OUTPUT_SCHEMA_BEGIN===",
    segments.outputSchema,
    "===OUTPUT_SCHEMA_END==="
  ].join("\n");
}

export const promptComposer: PromptComposer = {
  compose: composePrompt,
  composeInstructionBlock
};
