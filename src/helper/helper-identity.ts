import { randomUUID } from "node:crypto";
import type { HelperIdentity, HelperRole, PairingState } from "../contracts/v1/pairing.js";

export interface IdentitySnapshot {
  helperId: string;
  helperName: string;
  role: HelperRole;
  appVersion: string;
  platform: string;
  architecture: string;
}

export function detectPlatform(): { platform: string; architecture: string } {
  return {
    platform: process.platform,
    architecture: process.arch
  };
}

export function createDevelopmentIdentity(role: HelperRole): HelperIdentity {
  const { platform, architecture } = detectPlatform();
  const helperId = randomUUID();
  return {
    helperId,
    helperName: `Repair StackFlow Helper (dev) ${helperId.slice(0, 8)}`,
    role,
    pairingState: "unpaired",
    appVersion: "0.1.0-dev",
    platform,
    architecture
  };
}

export function snapshot(identity: HelperIdentity): IdentitySnapshot {
  return {
    helperId: identity.helperId,
    helperName: identity.helperName,
    role: identity.role,
    appVersion: identity.appVersion,
    platform: identity.platform,
    architecture: identity.architecture
  };
}

export function withState(identity: HelperIdentity, state: PairingState): HelperIdentity {
  return { ...identity, pairingState: state };
}
