import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockAIProvider, buildDeterministicResult } from "../../src/ai/mock-ai-provider.js";
import { OllamaProvider } from "../../src/ai/ollama-provider.js";
import { TaskRegistry } from "../../src/tasks/task-registry.js";
import { formatTechnicianNoteTemplate } from "../../src/tasks/format-technician-note/prompt-template.js";
import { TemporaryJobStore } from "../../src/jobs/temporary-job-store.js";
import { JobRunner } from "../../src/jobs/job-runner.js";
import { ProtocolError } from "../../src/contracts/v1/errors.js";
import { makeIdentity, makeConfig, makeValidJob } from "../helpers/fixtures.js";
import { toolRegistry } from "../../src/tools/tool-registry.js";
import { createDefaultAssistantProfileService } from "../../src/assistant/assistant-profile-service.js";
import type { ToolPolicy } from "../../src/tools/tool-authorization-service.js";

const defaultPolicy: ToolPolicy = {
  organizationId: "dev",
  toolId: "format_technician_note",
  enabled: true,
  allowedRoles: ["workstation_agent", "ai_host", "combined"],
  requiresConfirmation: false,
  executionLocation: "local"
};

function makeRunner(provider: MockAIProvider | OllamaProvider, identity = makeIdentity(), config = makeConfig()) {
  const store = new TemporaryJobStore();
  const registry = new TaskRegistry(new Map([["format_technician_note", formatTechnicianNoteTemplate]]), toolRegistry);
  const assistantProfileService = createDefaultAssistantProfileService();
  const runner = new JobRunner({
    identity,
    config,
    provider,
    taskRegistry: registry,
    store,
    toolRegistry,
    enabledTools: () => ["format_technician_note"],
    getToolPolicy: (toolId: string) => (toolId === "format_technician_note" ? defaultPolicy : null),
    assistantProfileService
  });
  return { runner, store, registry };
}

describe("mock provider", () => {
  it("returns a deterministic response", async () => {
    const mock = new MockAIProvider();
    const identity = makeIdentity();
    const { runner } = makeRunner(mock, identity);
    const job = makeValidJob({ assignedHelperId: identity.helperId });
    const outcome = await runner.run({ rawJob: job });
    expect(outcome.status).toBe("completed");
    expect(outcome.result?.provider).toBe("mock");
    expect(outcome.result?.result.formattedNote).toContain("Formatted technician note:");
  });

  it("produces identical output for identical input", async () => {
    const r1 = buildDeterministicResult("Battery might be bad.");
    const r2 = buildDeterministicResult("Battery might be bad.");
    expect(r1).toEqual(r2);
  });
});

describe("ollama provider (unavailable)", () => {
  it("reports unavailable when Ollama is not reachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const ollama = new OllamaProvider({ endpoint: "http://127.0.0.1:11434", fetchImpl });
    const health = await ollama.healthCheck();
    expect(health.status).toBe("unavailable");
  });

  it("reports model unavailable when endpoint is down", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    const ollama = new OllamaProvider({ endpoint: "http://127.0.0.1:11434", fetchImpl });
    const avail = await ollama.checkModel("llama3.2");
    expect(avail.available).toBe(false);
  });

  it("job runner fails with ai_target_unreachable when Ollama is down", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    const ollama = new OllamaProvider({ endpoint: "http://127.0.0.1:11434", fetchImpl });
    const identity = makeIdentity();
    const { runner, store } = makeRunner(ollama, identity);
    const job = makeValidJob({ assignedHelperId: identity.helperId });
    const outcome = await runner.run({ rawJob: job });
    expect(outcome.status).toBe("failed");
    expect(outcome.failure?.errorCode).toBe("ai_target_unreachable");
    expect(store.getActiveJob()).toBeNull();
  });
});

describe("structured output validation", () => {
  it("accepts valid structured output", async () => {
    const mock = new MockAIProvider();
    const identity = makeIdentity();
    const { runner } = makeRunner(mock, identity);
    const job = makeValidJob({ assignedHelperId: identity.helperId });
    const outcome = await runner.run({ rawJob: job });
    expect(outcome.status).toBe("completed");
    expect(outcome.result?.result.technicianFindings).toBeInstanceOf(Array);
  });

  it("rejects malformed AI JSON", async () => {
    const mock = new MockAIProvider();
    mock.execute = async () => ({ rawContent: "not json {", provider: "mock", model: "llama3.2", durationMs: 1 });
    const identity = makeIdentity();
    const { runner } = makeRunner(mock, identity);
    const job = makeValidJob({ assignedHelperId: identity.helperId });
    const outcome = await runner.run({ rawJob: job });
    expect(outcome.status).toBe("failed");
    expect(outcome.failure?.errorCode).toBe("malformed_ai_output");
  });

  it("rejects unexpected output fields", async () => {
    const mock = new MockAIProvider();
    mock.execute = async () => ({
      rawContent: JSON.stringify({
        formattedNote: "ok",
        customerReportedIssue: "ok",
        technicianFindings: [],
        recommendedNextStep: "ok",
        warnings: [],
        surpriseField: "bad"
      }),
      provider: "mock",
      model: "llama3.2",
      durationMs: 1
    });
    const identity = makeIdentity();
    const { runner } = makeRunner(mock, identity);
    const job = makeValidJob({ assignedHelperId: identity.helperId });
    const outcome = await runner.run({ rawJob: job });
    expect(outcome.status).toBe("failed");
    expect(outcome.failure?.errorCode).toBe("unexpected_output_field");
  });
});

describe("idempotency", () => {
  it("returns the same result for a duplicate job without re-executing", async () => {
    const mock = new MockAIProvider();
    const executeSpy = vi.spyOn(mock, "execute");
    const identity = makeIdentity();
    const { runner, store } = makeRunner(mock, identity);
    const job = makeValidJob({ assignedHelperId: identity.helperId });
    const first = await runner.run({ rawJob: job });
    expect(first.status).toBe("completed");
    const existing = store.getResultByJob(first.result!.jobId);
    expect(existing).not.toBeNull();
    const second = await runner.rerunIfDuplicate({ rawJob: job });
    expect(second?.status).toBe("completed");
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });
});

describe("temporary storage", () => {
  it("removes original technician-note content after completion", async () => {
    const mock = new MockAIProvider();
    const identity = makeIdentity();
    const { runner, store } = makeRunner(mock, identity);
    const job = makeValidJob({ assignedHelperId: identity.helperId });
    await runner.run({ rawJob: job });
    expect(store.getActiveJob()).toBeNull();
  });

  it("expires temporary results", async () => {
    const store = new TemporaryJobStore();
    const mock = new MockAIProvider();
    const identity = makeIdentity();
    const config = makeConfig();
    const registry = new TaskRegistry(new Map([["format_technician_note", formatTechnicianNoteTemplate]]), toolRegistry);
    const assistantProfileService = createDefaultAssistantProfileService();
    const runner = new JobRunner({
      identity,
      config,
      provider: mock,
      taskRegistry: registry,
      store,
      toolRegistry,
      enabledTools: () => ["format_technician_note"],
      getToolPolicy: (toolId: string) => (toolId === "format_technician_note" ? defaultPolicy : null),
      assistantProfileService
    });
    const job = makeValidJob({ assignedHelperId: identity.helperId });
    const outcome = await runner.run({ rawJob: job });
    expect(outcome.result).toBeDefined();
    // mutate expiry to past and verify purge
    const stored = store.getResultByJob(outcome.result!.jobId)!;
    stored.expiresAt = Date.now() - 1;
    expect(store.getResultByJob(outcome.result!.jobId)).toBeNull();
  });
});

describe("task registry", () => {
  it("rejects reserved-but-disabled tasks with task_not_enabled", () => {
    const registry = new TaskRegistry(new Map([["format_technician_note", formatTechnicianNoteTemplate]]));
    expect(() => registry.resolve("health_check")).toThrow(ProtocolError);
    try { registry.resolve("draft_customer_update"); } catch (e) {
      expect((e as ProtocolError).code).toBe("task_not_enabled");
    }
  });

  it("rejects unknown tasks", () => {
    const registry = new TaskRegistry(new Map([["format_technician_note", formatTechnicianNoteTemplate]]));
    expect(() => registry.resolve("arbitrary_chat")).toThrow(ProtocolError);
  });
});
