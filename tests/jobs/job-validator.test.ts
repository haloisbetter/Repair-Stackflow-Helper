import { describe, it, expect } from "vitest";
import { validateJobRequest, assertNoArbitraryPromptFields } from "../../src/jobs/job-validator.js";
import { ProtocolError } from "../../src/contracts/v1/errors.js";
import { SCHEMA_VERSION } from "../../src/contracts/v1/common.js";
import { makeIdentity, makeConfig, makeValidJob } from "../helpers/fixtures.js";

describe("job schema validation", () => {
  it("accepts a valid job", () => {
    const identity = makeIdentity();
    const job = makeValidJob({ assignedHelperId: identity.helperId });
    const result = validateJobRequest(job, { identity, config: makeConfig() });
    expect(result.task).toBe("format_technician_note");
  });

  it("rejects unsupported schema version", () => {
    const identity = makeIdentity();
    const job = makeValidJob({ schemaVersion: "2.0", assignedHelperId: identity.helperId });
    expect(() => validateJobRequest(job, { identity, config: makeConfig() })).toThrow(ProtocolError);
    try {
      validateJobRequest(job, { identity, config: makeConfig() });
    } catch (e) {
      expect((e as ProtocolError).code).toBe("schema_version_unsupported");
    }
  });

  it("rejects unsupported task", () => {
    const identity = makeIdentity();
    const job = makeValidJob({ task: "arbitrary_chat", assignedHelperId: identity.helperId });
    expect(() => validateJobRequest(job, { identity, config: makeConfig() })).toThrow(ProtocolError);
  });

  it("rejects helper assignment mismatch", () => {
    const identity = makeIdentity();
    const job = makeValidJob({ assignedHelperId: "00000000-0000-0000-0000-000000000000" });
    expect(() => validateJobRequest(job, { identity, config: makeConfig() })).toThrow(ProtocolError);
    try { validateJobRequest(job, { identity, config: makeConfig() }); } catch (e) {
      expect((e as ProtocolError).code).toBe("helper_assignment_mismatch");
    }
  });

  it("rejects organization mismatch", () => {
    const identity = makeIdentity();
    const job = makeValidJob({ organizationId: "other-org", assignedHelperId: identity.helperId });
    try { validateJobRequest(job, { identity, config: makeConfig() }); } catch (e) {
      expect((e as ProtocolError).code).toBe("organization_mismatch");
    }
  });

  it("rejects location mismatch", () => {
    const identity = makeIdentity({ locationId: "yorktown-dev" });
    const job = makeValidJob({ locationId: "other-loc", assignedHelperId: identity.helperId });
    try { validateJobRequest(job, { identity, config: makeConfig() }); } catch (e) {
      expect((e as ProtocolError).code).toBe("location_mismatch");
    }
  });

  it("rejects expired job", () => {
    const identity = makeIdentity();
    const job = makeValidJob({
      assignedHelperId: identity.helperId,
      expiresAt: new Date(Date.now() - 1000).toISOString()
    });
    try { validateJobRequest(job, { identity, config: makeConfig() }); } catch (e) {
      expect((e as ProtocolError).code).toBe("request_expired");
    }
  });

  it("rejects oversized note", () => {
    const identity = makeIdentity();
    const long = "x".repeat(5000);
    const job = makeValidJob({
      assignedHelperId: identity.helperId,
      input: { technicianNote: long, outputStyle: "professional_repair_note" }
    });
    try { validateJobRequest(job, { identity, config: makeConfig() }); } catch (e) {
      expect((e as ProtocolError).code).toBe("request_too_large");
    }
  });

  it("rejects arbitrary prompt fields", () => {
    expect(() => assertNoArbitraryPromptFields({ systemPrompt: "evil" })).toThrow(ProtocolError);
    expect(() => assertNoArbitraryPromptFields({ model: "evil" })).toThrow(ProtocolError);
    expect(() => assertNoArbitraryPromptFields({ tools: [] })).toThrow(ProtocolError);
    expect(() => assertNoArbitraryPromptFields({ shell: "rm -rf" })).toThrow(ProtocolError);
  });

  it("rejects unsupported output style", () => {
    const identity = makeIdentity();
    const job = makeValidJob({
      assignedHelperId: identity.helperId,
      input: { technicianNote: "ok", outputStyle: "casual" }
    });
    expect(() => validateJobRequest(job, { identity, config: makeConfig() })).toThrow(ProtocolError);
  });

  it("rejects oversized payload", () => {
    const identity = makeIdentity();
    const job = makeValidJob({
      assignedHelperId: identity.helperId,
      input: { technicianNote: "x".repeat(4096), outputStyle: "professional_repair_note" }
    });
    try { validateJobRequest(job, { identity, config: makeConfig({ maxRequestBytes: 512 }) }); } catch (e) {
      expect((e as ProtocolError).code).toBe("request_too_large");
    }
  });
});
