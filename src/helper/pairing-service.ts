import { randomUUID } from "node:crypto";
import { ProtocolError } from "../contracts/v1/errors.js";
import type { DevPairingAssignment } from "../contracts/v1/pairing.js";

const DEV_CODES = new Map<string, DevPairingAssignment>([
  [
    "DEV-YORKTOWN",
    {
      organizationId: "computer-concepts-dev",
      organizationName: "Computer Concepts LLC",
      locationId: "yorktown-dev",
      locationName: "Yorktown",
      helperRole: "combined",
      expiresInSeconds: 600
    }
  ],
  [
    "DEV-HAMPTON",
    {
      organizationId: "computer-concepts-dev",
      organizationName: "Computer Concepts LLC",
      locationId: "hampton-dev",
      locationName: "Hampton",
      helperRole: "combined",
      expiresInSeconds: 600
    }
  ]
]);

const EXPIRED_DEV_CODES = new Set<string>(["DEV-EXPIRED"]);

export interface PairingResult {
  organizationId: string;
  organizationName: string;
  locationId: string;
  locationName: string;
  helperRole: DevPairingAssignment["helperRole"];
  pairedAt: string;
}

export interface PairingService {
  pair(code: string): Promise<PairingResult>;
  unpair(): Promise<void>;
}

export function createDevPairingService(): PairingService {
  return {
    async pair(code: string): Promise<PairingResult> {
      if (EXPIRED_DEV_CODES.has(code)) {
        throw new ProtocolError("pairing_code_expired", "Development pairing code has expired.", false);
      }
      const assignment = DEV_CODES.get(code);
      if (!assignment) {
        throw new ProtocolError("pairing_code_invalid", "Unknown development pairing code.", false);
      }
      return {
        organizationId: assignment.organizationId,
        organizationName: assignment.organizationName,
        locationId: assignment.locationId,
        locationName: assignment.locationName,
        helperRole: assignment.helperRole,
        pairedAt: new Date().toISOString()
      };
    },
    async unpair(): Promise<void> {
      // No persistent credential to revoke in development mode.
    }
  };
}

export function listKnownDevCodes(): string[] {
  return Array.from(DEV_CODES.keys());
}

export function createProductionPairingServiceStub(): PairingService {
  return {
    async pair(): Promise<PairingResult> {
      throw new ProtocolError("not_configured", "Production pairing is not configured in this MVP.", false);
    },
    async unpair(): Promise<void> {
      throw new ProtocolError("not_configured", "Production pairing is not configured in this MVP.", false);
    }
  };
}

export function newRequestIds(): { jobId: string; requestId: string } {
  return { jobId: randomUUID(), requestId: randomUUID() };
}
