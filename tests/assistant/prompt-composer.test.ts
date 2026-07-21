import { describe, it, expect } from "vitest";
import { composePrompt, composeInstructionBlock } from "../../src/assistant/prompt-composer.js";
import { DEFAULT_INSTRUCTION_PROFILE } from "../../src/assistant/instruction-profile.js";

describe("composePrompt", () => {
  it("produces all five delimited sections in order", () => {
    const result = composePrompt({
      platformSafety: "SAFETY",
      trustedTask: "TASK",
      organizationInstructions: "INSTRUCTIONS",
      untrustedInput: "INPUT",
      outputSchema: "SCHEMA"
    });
    const safetyIdx = result.indexOf("===PLATFORM_SAFETY_BEGIN===");
    const taskIdx = result.indexOf("===TRUSTED_TASK_BEGIN===");
    const orgIdx = result.indexOf("===ORGANIZATION_INSTRUCTIONS_BEGIN===");
    const inputIdx = result.indexOf("===UNTRUSTED_INPUT_BEGIN===");
    const schemaIdx = result.indexOf("===OUTPUT_SCHEMA_BEGIN===");
    expect(safetyIdx).toBeGreaterThanOrEqual(0);
    expect(taskIdx).toBeGreaterThan(safetyIdx);
    expect(orgIdx).toBeGreaterThan(taskIdx);
    expect(inputIdx).toBeGreaterThan(orgIdx);
    expect(schemaIdx).toBeGreaterThan(inputIdx);
  });

  it("includes all section content", () => {
    const result = composePrompt({
      platformSafety: "SAFETY",
      trustedTask: "TASK",
      organizationInstructions: "INSTRUCTIONS",
      untrustedInput: "INPUT",
      outputSchema: "SCHEMA"
    });
    expect(result).toContain("SAFETY");
    expect(result).toContain("TASK");
    expect(result).toContain("INSTRUCTIONS");
    expect(result).toContain("INPUT");
    expect(result).toContain("SCHEMA");
  });

  it("wraps each section with begin/end delimiters", () => {
    const result = composePrompt({
      platformSafety: "SAFETY",
      trustedTask: "TASK",
      organizationInstructions: "INSTRUCTIONS",
      untrustedInput: "INPUT",
      outputSchema: "SCHEMA"
    });
    expect(result).toContain("===PLATFORM_SAFETY_BEGIN===");
    expect(result).toContain("===PLATFORM_SAFETY_END===");
    expect(result).toContain("===OUTPUT_SCHEMA_END===");
  });
});

describe("composeInstructionBlock", () => {
  it("includes global instructions", () => {
    const block = composeInstructionBlock(DEFAULT_INSTRUCTION_PROFILE);
    expect(block).toContain("GLOBAL INSTRUCTIONS:");
    expect(block).toContain(DEFAULT_INSTRUCTION_PROFILE.globalInstructions);
  });

  it("includes tone rules when present", () => {
    const block = composeInstructionBlock(DEFAULT_INSTRUCTION_PROFILE);
    expect(block).toContain("TONE RULES:");
    expect(block).toContain("1. Professional and respectful");
  });

  it("includes formatting rules when present", () => {
    const block = composeInstructionBlock(DEFAULT_INSTRUCTION_PROFILE);
    expect(block).toContain("FORMATTING RULES:");
  });

  it("includes prohibited claims when present", () => {
    const block = composeInstructionBlock(DEFAULT_INSTRUCTION_PROFILE);
    expect(block).toContain("PROHIBITED CLAIMS:");
  });

  it("includes escalation rules when present", () => {
    const block = composeInstructionBlock(DEFAULT_INSTRUCTION_PROFILE);
    expect(block).toContain("ESCALATION RULES:");
  });

  it("omits empty rule sections", () => {
    const block = composeInstructionBlock({
      globalInstructions: "Only global.",
      toneRules: [],
      formattingRules: [],
      prohibitedClaims: [],
      escalationRules: [],
      profileVersion: 1
    });
    expect(block).toContain("GLOBAL INSTRUCTIONS:");
    expect(block).not.toContain("TONE RULES:");
    expect(block).not.toContain("FORMATTING RULES:");
  });
});
