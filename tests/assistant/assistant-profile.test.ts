import { describe, it, expect } from "vitest";
import { AssistantProfileSchema, DEFAULT_ASSISTANT_PROFILE } from "../../src/assistant/assistant-profile.js";

describe("AssistantProfileSchema", () => {
  it("accepts a valid default profile", () => {
    const result = AssistantProfileSchema.safeParse(DEFAULT_ASSISTANT_PROFILE);
    expect(result.success).toBe(true);
  });

  it("rejects name shorter than 1 char", () => {
    const result = AssistantProfileSchema.safeParse({ ...DEFAULT_ASSISTANT_PROFILE, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 40 chars", () => {
    const result = AssistantProfileSchema.safeParse({ ...DEFAULT_ASSISTANT_PROFILE, name: "A".repeat(41) });
    expect(result.success).toBe(false);
  });

  it("rejects subtitle longer than 80 chars", () => {
    const result = AssistantProfileSchema.safeParse({ ...DEFAULT_ASSISTANT_PROFILE, subtitle: "A".repeat(81) });
    expect(result.success).toBe(false);
  });

  it("rejects welcomeMessage longer than 300 chars", () => {
    const result = AssistantProfileSchema.safeParse({ ...DEFAULT_ASSISTANT_PROFILE, welcomeMessage: "A".repeat(301) });
    expect(result.success).toBe(false);
  });

  it("rejects avatar initials longer than 3 chars", () => {
    const result = AssistantProfileSchema.safeParse({
      ...DEFAULT_ASSISTANT_PROFILE,
      avatar: { type: "initials", value: "ABCD" }
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid hex accent color", () => {
    const result = AssistantProfileSchema.safeParse({
      ...DEFAULT_ASSISTANT_PROFILE,
      appearance: { accentColor: "green" }
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive profileVersion", () => {
    const result = AssistantProfileSchema.safeParse({ ...DEFAULT_ASSISTANT_PROFILE, profileVersion: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields", () => {
    const result = AssistantProfileSchema.safeParse({ ...DEFAULT_ASSISTANT_PROFILE, extra: "bad" });
    expect(result.success).toBe(false);
  });

  it("rejects HTML tags in name", () => {
    const result = AssistantProfileSchema.safeParse({ ...DEFAULT_ASSISTANT_PROFILE, name: "<script>bad</script>" });
    expect(result.success).toBe(false);
  });

  it("rejects URLs in welcomeMessage", () => {
    const result = AssistantProfileSchema.safeParse({
      ...DEFAULT_ASSISTANT_PROFILE,
      welcomeMessage: "Visit https://evil.com now"
    });
    expect(result.success).toBe(false);
  });
});
