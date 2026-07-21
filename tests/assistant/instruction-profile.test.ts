import { describe, it, expect } from "vitest";
import { InstructionProfileSchema, DEFAULT_INSTRUCTION_PROFILE } from "../../src/assistant/instruction-profile.js";

describe("InstructionProfileSchema", () => {
  it("accepts the default instruction profile", () => {
    const result = InstructionProfileSchema.safeParse(DEFAULT_INSTRUCTION_PROFILE);
    expect(result.success).toBe(true);
  });

  it("rejects empty globalInstructions", () => {
    const result = InstructionProfileSchema.safeParse({ ...DEFAULT_INSTRUCTION_PROFILE, globalInstructions: "" });
    expect(result.success).toBe(false);
  });

  it("rejects globalInstructions over 2000 chars", () => {
    const result = InstructionProfileSchema.safeParse({
      ...DEFAULT_INSTRUCTION_PROFILE,
      globalInstructions: "A".repeat(2001)
    });
    expect(result.success).toBe(false);
  });

  it("rejects URLs in toneRules", () => {
    const result = InstructionProfileSchema.safeParse({
      ...DEFAULT_INSTRUCTION_PROFILE,
      toneRules: ["See http://evil.com"]
    });
    expect(result.success).toBe(false);
  });

  it("rejects HTML tags in formattingRules", () => {
    const result = InstructionProfileSchema.safeParse({
      ...DEFAULT_INSTRUCTION_PROFILE,
      formattingRules: ["<b>bold</b>"]
    });
    expect(result.success).toBe(false);
  });

  it("rejects shell commands in escalationRules", () => {
    const result = InstructionProfileSchema.safeParse({
      ...DEFAULT_INSTRUCTION_PROFILE,
      escalationRules: ["Run rm -rf / to fix"]
    });
    expect(result.success).toBe(false);
  });

  it("rejects secrets in prohibitedClaims", () => {
    const result = InstructionProfileSchema.safeParse({
      ...DEFAULT_INSTRUCTION_PROFILE,
      prohibitedClaims: ["password: secret123"]
    });
    expect(result.success).toBe(false);
  });

  it("rejects model names in globalInstructions", () => {
    const result = InstructionProfileSchema.safeParse({
      ...DEFAULT_INSTRUCTION_PROFILE,
      globalInstructions: "Use gpt-4 for everything"
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields", () => {
    const result = InstructionProfileSchema.safeParse({ ...DEFAULT_INSTRUCTION_PROFILE, extra: "bad" });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive profileVersion", () => {
    const result = InstructionProfileSchema.safeParse({ ...DEFAULT_INSTRUCTION_PROFILE, profileVersion: -1 });
    expect(result.success).toBe(false);
  });
});
