import { describe, it, expect } from "vitest";
import { DiagnosticService } from "../../src/diagnostics/diagnostic-service.js";
import { TemporaryJobStore } from "../../src/jobs/temporary-job-store.js";
import { makeIdentity, makeConfig } from "../helpers/fixtures.js";

describe("diagnostic service", () => {
  it("produces a sanitized snapshot without note content", () => {
    const identity = makeIdentity();
    const config = makeConfig();
    const store = new TemporaryJobStore();
    store.setLastSanitizedError("ai_target_unreachable");
    const svc = new DiagnosticService(() => identity, () => config, () => null, () => store);
    const snap = svc.snapshot();
    expect(snap.helperId).toBe(identity.helperId);
    expect(snap.errorCode).toBe("ai_target_unreachable");
    expect(snap.activeJobId).toBeNull();
    expect(JSON.stringify(snap)).not.toContain("technicianNote");
    expect(JSON.stringify(snap)).not.toContain("formattedNote");
  });

  it("sanitize redacts sensitive fields", () => {
    const identity = makeIdentity();
    const config = makeConfig();
    const store = new TemporaryJobStore();
    const svc = new DiagnosticService(() => identity, () => config, () => null, () => store);
    const sanitized = svc.sanitize({
      helperId: "ok",
      technicianNote: "Customer says X",
      token: "secret",
      result: { formattedNote: "secret note" }
    });
    expect(JSON.stringify(sanitized)).not.toContain("Customer says X");
    expect(JSON.stringify(sanitized)).not.toContain("secret note");
    expect(sanitized).toEqual({
      helperId: "ok",
      technicianNote: "[redacted]",
      token: "[redacted]",
      result: { formattedNote: "[redacted]" }
    });
  });
});
