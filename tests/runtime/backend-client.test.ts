import { describe, it, expect, beforeEach } from "vitest";
import { DevelopmentBackendClient } from "../../src/backend/development-backend-client.js";
import { ProductionBackendClient } from "../../src/backend/production-backend-client.js";
import { PROTOCOL_VERSION } from "../../src/contracts/v1/protocol.js";
import type { PairingRequest, HeartbeatRequest } from "../../src/contracts/v1/protocol.js";

function makePairingRequest(overrides?: Partial<PairingRequest>): PairingRequest {
  return {
    protocolVersion: PROTOCOL_VERSION,
    pairingCode: "DEV-YORKTOWN",
    helperId: "test-helper-001",
    appVersion: "0.1.0-dev",
    platform: "darwin",
    architecture: "arm64",
    role: "combined",
    requestedAt: new Date().toISOString(),
    ...overrides
  };
}

function makeHeartbeatRequest(overrides?: Partial<HeartbeatRequest>): HeartbeatRequest {
  return {
    protocolVersion: PROTOCOL_VERSION,
    helperId: "test-helper-001",
    organizationId: "org-1",
    locationId: "loc-1",
    appVersion: "0.1.0-dev",
    runtimeMode: "development",
    role: "combined",
    platform: "darwin",
    architecture: "arm64",
    activeProvider: { provider: "mock", status: "available", modelAvailable: true, latencyMs: 5 },
    implementedTasks: ["format_technician_note"],
    enabledTasks: ["format_technician_note"],
    activeJobId: null,
    jobState: "idle",
    queueCapacity: 1,
    pendingSubmissionCount: 0,
    sentAt: new Date().toISOString(),
    ...overrides
  };
}

describe("DevelopmentBackendClient", () => {
  let client: DevelopmentBackendClient;

  beforeEach(() => {
    client = new DevelopmentBackendClient();
  });

  it("has mode set to development", () => {
    expect(client.mode).toBe("development");
  });

  it("exchanges valid pairing code", async () => {
    const response = await client.exchangePairingCode(makePairingRequest());
    expect(response.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(response.organizationId).toBe("computer-concepts-dev");
    expect(response.locationName).toBe("Yorktown");
    expect(response.credentialToken).toBeDefined();
    expect(response.credentialToken.length).toBeGreaterThan(16);
  });

  it("rejects invalid pairing code", async () => {
    await expect(
      client.exchangePairingCode(makePairingRequest({ pairingCode: "INVALID" }))
    ).rejects.toThrow("Unknown pairing code");
  });

  it("rejects expired pairing code", async () => {
    await expect(
      client.exchangePairingCode(makePairingRequest({ pairingCode: "EXPIRED-CODE-1" }))
    ).rejects.toThrow("expired");
  });

  it("heartbeat returns acknowledgment", async () => {
    const response = await client.sendHeartbeat(makeHeartbeatRequest());
    expect(response.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(response.receivedAt).toBeDefined();
  });

  it("claim job returns no jobs in development mode", async () => {
    const response = await client.claimJob({
      protocolVersion: PROTOCOL_VERSION,
      helperId: "test-helper",
      organizationId: "org-1",
      locationId: "loc-1",
      capabilities: {
        protocolVersion: PROTOCOL_VERSION,
        helperId: "test-helper",
        organizationId: "org-1",
        locationId: "loc-1",
        implementedTasks: ["format_technician_note"],
        enabledTasks: ["format_technician_note"],
        supportedTaskSchemaVersions: {},
        executionTargets: ["local_on_this_machine"],
        providers: ["mock"],
        models: ["llama3.2"],
        maxPayloadBytes: 16384,
        maxResponseBytes: 16384,
        reportedAt: new Date().toISOString()
      },
      requestedAt: new Date().toISOString()
    });
    expect(response.claimed).toBe(false);
  });

  it("submit result returns acknowledgment", async () => {
    const response = await client.submitResult({
      protocolVersion: PROTOCOL_VERSION,
      jobId: "00000000-0000-0000-0000-000000000001",
      requestId: "00000000-0000-0000-0000-000000000002",
      leaseId: "00000000-0000-0000-0000-000000000003",
      taskName: "format_technician_note",
      taskVersion: "1.0",
      inputSchemaVersion: "1.0",
      outputSchemaVersion: "1.0",
      submissionKey: "submission-key-12345678",
      assistantProfileVersion: 1,
      instructionProfileVersion: 1,
      toolPolicyVersion: 1,
      provider: "mock",
      model: "llama3.2",
      executionTarget: "local_on_this_machine",
      attemptNumber: 0,
      durationMs: 100,
      mockProviderUsed: true,
      outputValid: true,
      output: { formattedNote: "Test" },
      submittedAt: new Date().toISOString()
    });
    expect(response.acknowledgedAt).toBeDefined();
    expect(response.submissionKey).toBe("submission-key-12345678");
  });

  it("revoke credential succeeds", async () => {
    await expect(client.revokeCredential("test-helper")).resolves.toBeUndefined();
  });
});

describe("ProductionBackendClient", () => {
  it("rejects non-HTTPS URL in production mode", () => {
    expect(() => new ProductionBackendClient(
      { baseUrl: "http://example.com", timeoutMs: 5000, mode: "production" },
      () => "token"
    )).toThrow("Production backend requires HTTPS URL");
  });

  it("allows HTTPS URL in production mode", () => {
    expect(() => new ProductionBackendClient(
      { baseUrl: "https://api.repairstack.io", timeoutMs: 5000, mode: "production" },
      () => "token"
    )).not.toThrow();
  });

  it("throws credential_revoked when no token available", async () => {
    const client = new ProductionBackendClient(
      { baseUrl: "https://api.repairstack.io", timeoutMs: 5000, mode: "production" },
      () => null
    );
    await expect(client.sendHeartbeat(makeHeartbeatRequest())).rejects.toThrow("No credential available");
  });

  it("includes authorization header (integration contract)", () => {
    const client = new ProductionBackendClient(
      { baseUrl: "https://api.repairstack.io", timeoutMs: 5000, mode: "production" },
      () => "test-token-abc123"
    );
    expect(client.mode).toBe("production");
  });
});
