import { describe, it, expect } from "vitest";
import { validateStructuredOutput } from "../../src/tasks/format-technician-note/response-validator.js";
import { ProtocolError } from "../../src/contracts/v1/errors.js";

const VALID = {
  formattedNote: "Professional note.",
  customerReportedIssue: "Customer reports laptop shuts off.",
  technicianFindings: ["Battery voltage low."],
  recommendedNextStep: "Run battery diagnostic.",
  warnings: []
};

describe("structured output validator", () => {
  it("accepts valid output", () => {
    const r = validateStructuredOutput(JSON.stringify(VALID));
    expect(r.ok).toBe(true);
    expect(r.output?.formattedNote).toBe("Professional note.");
  });

  it("rejects malformed JSON", () => {
    expect(() => validateStructuredOutput("not json")).toThrow(ProtocolError);
    try { validateStructuredOutput("{ broken"); } catch (e) {
      expect((e as ProtocolError).code).toBe("malformed_ai_output");
    }
  });

  it("rejects unexpected fields", () => {
    const bad = { ...VALID, extra: "bad" };
    expect(() => validateStructuredOutput(JSON.stringify(bad))).toThrow(ProtocolError);
    try { validateStructuredOutput(JSON.stringify(bad)); } catch (e) {
      expect((e as ProtocolError).code).toBe("unexpected_output_field");
    }
  });

  it("rejects missing required fields", () => {
    const bad = { formattedNote: "ok", customerReportedIssue: "ok" };
    try { validateStructuredOutput(JSON.stringify(bad)); } catch (e) {
      expect((e as ProtocolError).code).toBe("validation_failed");
    }
  });
});
