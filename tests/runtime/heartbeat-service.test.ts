import { describe, it, expect, beforeEach } from "vitest";
import { HeartbeatService, type HeartbeatServiceDeps } from "../../src/runtime/heartbeat-service.js";
import { HelperStateMachine } from "../../src/runtime/state-machines.js";
import { DevelopmentBackendClient } from "../../src/backend/development-backend-client.js";
import { TaskRegistry } from "../../src/tasks/task-registry.js";
import { formatTechnicianNoteTemplate } from "../../src/tasks/format-technician-note/prompt-template.js";
import type { HelperHealth } from "../../src/helper/health-service.js";

function makeHeartbeatDeps(overrides?: Partial<HeartbeatServiceDeps>): HeartbeatServiceDeps {
  return {
    getIdentity: () => ({
      helperId: "test-helper-001",
      organizationId: "org-1",
      locationId: "loc-1",
      role: "combined",
      appVersion: "0.1.0-dev",
      platform: "linux",
      architecture: "x64"
    }),
    getHealth: (): HelperHealth | null => ({
      state: "ready",
      provider: "mock",
      executionTarget: "local_on_this_machine",
      ollamaEndpoint: "http://127.0.0.1:11434",
      approvedModel: "llama3.2",
      ollamaReachable: true,
      modelAvailable: true,
      latencyMs: 10,
      checkedAt: new Date().toISOString()
    }),
    stateMachine: new HelperStateMachine("ready"),
    backendClient: new DevelopmentBackendClient(),
    taskRegistry: new TaskRegistry(new Map([["format_technician_note", formatTechnicianNoteTemplate]])),
    getActiveJobId: () => null,
    getJobState: () => "idle",
    getPendingSubmissionCount: () => 0,
    runtimeMode: "development",
    ...overrides
  };
}

describe("HeartbeatService", () => {
  let service: HeartbeatService;

  beforeEach(() => {
    service = new HeartbeatService(makeHeartbeatDeps());
  });

  it("sends heartbeat successfully", async () => {
    const result = await service.sendHeartbeat();
    expect(result).toBe(true);
    expect(service.lastSuccess).not.toBeNull();
  });

  it("heartbeat payload has no customer content", async () => {
    const deps = makeHeartbeatDeps();
    const capturedRequests: unknown[] = [];
    const devClient = new DevelopmentBackendClient();
    deps.backendClient = {
      ...devClient,
      mode: devClient.mode,
      async sendHeartbeat(request: unknown) {
        capturedRequests.push(request);
        return { protocolVersion: "1.0" as const, receivedAt: new Date().toISOString() };
      }
    } as typeof devClient;
    service = new HeartbeatService(deps);
    await service.sendHeartbeat();
    const payload = JSON.stringify(capturedRequests[0]);
    expect(payload).not.toContain("technicianNote");
    expect(payload).not.toContain("customer");
    expect(payload).not.toContain("formattedNote");
    expect(payload).not.toContain("password");
    expect(payload).not.toContain("secret");
  });

  it("capabilities reflect actual registry", () => {
    const report = service.buildCapabilityReport();
    expect(report.implementedTasks).toContain("format_technician_note");
    expect(report.enabledTasks).toContain("format_technician_note");
    expect(report.providers).toContain("ollama");
    expect(report.providers).toContain("mock");
    expect(report.executionTargets).toContain("local_on_this_machine");
  });

  it("unimplemented tasks not in capability report", () => {
    const report = service.buildCapabilityReport();
    expect(report.implementedTasks).not.toContain("draft_customer_update");
    expect(report.implementedTasks).not.toContain("health_check");
  });

  it("heartbeat failure triggers degraded after 3 consecutive failures", async () => {
    const sm = new HelperStateMachine("ready");
    const failingClient = {
      ...new DevelopmentBackendClient(),
      async sendHeartbeat() { throw new Error("network error"); }
    } as any;
    service = new HeartbeatService(makeHeartbeatDeps({ stateMachine: sm, backendClient: failingClient }));
    await service.sendHeartbeat();
    await service.sendHeartbeat();
    expect(sm.state).toBe("ready");
    await service.sendHeartbeat();
    expect(sm.state).toBe("degraded");
  });

  it("does not send if no organizationId", async () => {
    service = new HeartbeatService(makeHeartbeatDeps({
      getIdentity: () => ({
        helperId: "test", role: "combined", appVersion: "0.1.0", platform: "linux", architecture: "x64"
      })
    }));
    const result = await service.sendHeartbeat();
    expect(result).toBe(false);
  });
});
