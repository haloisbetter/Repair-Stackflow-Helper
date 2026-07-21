import { randomUUID } from "node:crypto";
import { SCHEMA_VERSION } from "../../src/contracts/v1/common.js";
import type { HelperIdentity } from "../../src/contracts/v1/pairing.js";
import type { HelperConfig } from "../../src/config/helper-config.js";
import { DEFAULT_CONFIG } from "../../src/config/helper-config.js";
import { detectPlatform } from "../../src/helper/helper-identity.js";

export function makeIdentity(overrides: Partial<HelperIdentity> = {}): HelperIdentity {
  const { platform, architecture } = detectPlatform();
  return {
    helperId: randomUUID(),
    helperName: "Test Helper",
    role: "combined",
    pairingState: "paired_ready",
    organizationId: "computer-concepts-dev",
    locationId: "yorktown-dev",
    appVersion: "0.1.0-dev",
    platform,
    architecture,
    ...overrides
  };
}

export function makeConfig(overrides: Partial<HelperConfig> = {}): HelperConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

export function makeValidJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    jobId: randomUUID(),
    requestId: randomUUID(),
    task: "format_technician_note",
    organizationId: "computer-concepts-dev",
    locationId: "yorktown-dev",
    assignedHelperId: "replace-me",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
    input: {
      technicianNote: "Customer says laptop shuts off when unplugged. Battery might be bad.",
      outputStyle: "professional_repair_note"
    },
    ...overrides
  };
}
