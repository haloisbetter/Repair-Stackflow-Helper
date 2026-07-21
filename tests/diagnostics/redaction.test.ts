import { describe, it, expect } from "vitest";
import { redactObject, redactString, isSafeDiagnosticKey } from "../../src/diagnostics/redaction.js";

describe("redaction", () => {
  it("redacts sensitive string values", () => {
    expect(redactString("secret-token")).toBe("[redacted]");
    expect(redactString("")).toBe("");
  });

  it("redacts sensitive keys in objects", () => {
    const input = {
      helperId: "abc",
      technicianNote: "Customer says X",
      token: "super-secret",
      nested: { systemPrompt: "evil", ok: "fine" }
    };
    const out = redactObject(input);
    expect(out).toEqual({
      helperId: "abc",
      technicianNote: "[redacted]",
      token: "[redacted]",
      nested: { systemPrompt: "[redacted]", ok: "fine" }
    });
  });

  it("marks sensitive keys as unsafe diagnostic keys", () => {
    expect(isSafeDiagnosticKey("helperId")).toBe(true);
    expect(isSafeDiagnosticKey("technicianNote")).toBe(false);
    expect(isSafeDiagnosticKey("token")).toBe(false);
    expect(isSafeDiagnosticKey("rawContent")).toBe(false);
  });

  it("redacts arrays of strings under sensitive keys", () => {
    const out = redactObject({ technicianFindings: ["a", "b"] });
    expect(out).toEqual({ technicianFindings: ["a", "b"] });
  });

  it("redacts plain string arrays at top level", () => {
    const out = redactObject(["a", "b"]);
    expect(out).toEqual(["a", "b"]);
  });
});
