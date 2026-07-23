import { describe, it, expect } from "vitest";
import { RuntimeCoordinator, DEFAULT_RUNTIME_CONFIG, type RuntimeCoordinatorDeps, type RuntimeCoordinatorConfig } from "../../src/runtime/runtime-coordinator.js";
import { DevelopmentBackendClient } from "../../src/backend/development-backend-client.js";
import { InMemoryCredentialStore } from "../../src/backend/credential-store.js";
import { InMemoryPendingSubmissionStore } from "../../src/runtime/pending-submission-store.js";
import { TaskRegistry } from "../../src/tasks/task-registry.js";
import { formatTechnicianNoteTemplate } from "../../src/tasks/format-technician-note/prompt-template.js";
import type { JobRunner } from "../../src/jobs/job-runner.js";

function makeDeps(overrides?: Partial<RuntimeCoordinatorDeps>): RuntimeCoordinatorDeps {
  return {
    backendClient: new DevelopmentBackendClient(),
    credentialStore: new InMemoryCredentialStore(),
    pendingStore: new InMemoryPendingSubmissionStore(),
    taskRegistry: new TaskRegistry(new Map([["format_technician_note", formatTechnicianNoteTemplate]])),
    jobRunner: { run: async () => ({ status: "completed" as const }) } as unknown as JobRunner,
    getIdentity: () => ({
      helperId: "test-helper",
      organizationId: "org-1",
      locationId: "loc-1",
      role: "combined",
      appVersion: "0.1.0-dev",
      platform: "linux",
      architecture: "x64"
    }),
    getHealth: () => null,
    getAssistantProfileVersion: () => 1,
    getInstructionProfileVersion: () => 1,
    getToolPolicyVersion: () => 1,
    ...overrides
  };
}

function makeCoordinator(
  depsOverrides?: Partial<RuntimeCoordinatorDeps>,
  configOverrides?: Partial<RuntimeCoordinatorConfig>
) {
  const deps = makeDeps(depsOverrides);
  const config = { ...DEFAULT_RUNTIME_CONFIG, ...configOverrides };
  return { coordinator: new RuntimeCoordinator(deps, config), deps };
}

describe("RuntimeCoordinator", () => {
  it("starts in unconfigured then moves to unpaired when no credential", async () => {
    const { coordinator } = makeCoordinator();
    expect(coordinator.helperState.state).toBe("unconfigured");
    await coordinator.start();
    expect(coordinator.helperState.state).toBe("unpaired");
  });

  it("reports development mode in status", async () => {
    const { coordinator } = makeCoordinator();
    await coordinator.start();
    const status = coordinator.getStatus();
    expect(status.mode).toBe("development");
    expect(status.protocolVersion).toBe("1.0");
    expect(status.credentialPresent).toBe(false);
    expect(status.credentialStatus).toBe("absent");
  });

  it("pairing stores credential and transitions to ready", async () => {
    const credentialStore = new InMemoryCredentialStore();
    const { coordinator } = makeCoordinator({ credentialStore });
    await coordinator.start();
    await coordinator.pair("DEV-YORKTOWN");
    const status = coordinator.getStatus();
    expect(status.helperState).toBe("ready");
    expect(status.credentialPresent).toBe(true);
    expect(status.credentialStatus).toBe("valid");
    const stored = await credentialStore.loadCredential();
    expect(stored?.organizationId).toBe("computer-concepts-dev");
  });

  it("pairing with invalid code remains unpaired", async () => {
    const { coordinator } = makeCoordinator();
    await coordinator.start();
    await expect(coordinator.pair("INVALID")).rejects.toThrow();
    expect(coordinator.helperState.state).toBe("unpaired");
  });

  it("unpair clears credential and goes to unpaired", async () => {
    const credentialStore = new InMemoryCredentialStore();
    const { coordinator } = makeCoordinator({ credentialStore });
    await coordinator.start();
    await coordinator.pair("DEV-YORKTOWN");
    await coordinator.unpair();
    expect(coordinator.helperState.state).toBe("unpaired");
    expect(await credentialStore.hasCredential()).toBe(false);
  });

  it("start with existing credential transitions to ready or degraded", async () => {
    const credentialStore = new InMemoryCredentialStore();
    await credentialStore.saveCredential({
      token: "stored-token",
      helperId: "test-helper",
      organizationId: "org-1",
      locationId: "loc-1",
      role: "combined",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    });
    const { coordinator } = makeCoordinator({ credentialStore });
    await coordinator.start();
    const state = coordinator.helperState.state;
    expect(state === "ready" || state === "degraded").toBe(true);
  });

  it("start with expired credential transitions to credential_expired", async () => {
    const credentialStore = new InMemoryCredentialStore();
    await credentialStore.saveCredential({
      token: "expired-token",
      helperId: "test-helper",
      organizationId: "org-1",
      locationId: "loc-1",
      role: "combined",
      issuedAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() - 500).toISOString()
    });
    const { coordinator } = makeCoordinator({ credentialStore });
    await coordinator.start();
    expect(coordinator.helperState.state).toBe("credential_expired");
  });

  it("credential absent from status JSON", () => {
    const { coordinator } = makeCoordinator();
    const status = coordinator.getStatus();
    const json = JSON.stringify(status);
    expect(json).not.toContain("\"token\"");
    expect(json).not.toContain("credentialToken");
    expect(json).not.toContain("password");
    expect(json).not.toContain("secret");
  });

  it("stop halts heartbeat and claim loop", async () => {
    const { coordinator } = makeCoordinator();
    await coordinator.start();
    await coordinator.pair("DEV-YORKTOWN");
    await coordinator.stop();
    expect(coordinator.getStatus().claimLoopRunning).toBe(false);
  });

  it("production mode creates coordinator without error", () => {
    expect(() => makeCoordinator(undefined, { mode: "production" })).not.toThrow();
  });
});
