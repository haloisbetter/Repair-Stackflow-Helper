import { z } from "zod";
import { HelperId, IsoTimestamp, OrganizationId, LocationId, Uuid } from "./common.js";

export const PairingState = z.enum([
  "unpaired",
  "pairing",
  "paired_disconnected",
  "paired_ready",
  "processing",
  "degraded",
  "error"
]);
export type PairingState = z.infer<typeof PairingState>;

export const HelperRole = z.enum(["workstation_agent", "ai_host", "combined"]);
export type HelperRole = z.infer<typeof HelperRole>;

export const HelperIdentity = z.object({
  helperId: HelperId,
  helperName: z.string().min(1).max(128),
  role: HelperRole,
  pairingState: PairingState,
  organizationId: OrganizationId.optional(),
  locationId: LocationId.optional(),
  appVersion: z.string().min(1).max(64),
  platform: z.string().min(1).max(64),
  architecture: z.string().min(1).max(64)
});
export type HelperIdentity = z.infer<typeof HelperIdentity>;

export const DevPairRequest = z.object({
  pairingCode: z.string().min(1).max(128)
});
export type DevPairRequest = z.infer<typeof DevPairRequest>;

export const DevPairResponse = z.object({
  paired: z.literal(true),
  organizationId: OrganizationId,
  organizationName: z.string().min(1).max(256),
  locationId: LocationId,
  locationName: z.string().min(1).max(256),
  helperRole: HelperRole,
  pairedAt: IsoTimestamp
});
export type DevPairResponse = z.infer<typeof DevPairResponse>;

export const DevPairingAssignment = z.object({
  organizationId: OrganizationId,
  organizationName: z.string().min(1).max(256),
  locationId: LocationId,
  locationName: z.string().min(1).max(256),
  helperRole: HelperRole,
  expiresInSeconds: z.number().int().positive().max(3600).optional()
});
export type DevPairingAssignment = z.infer<typeof DevPairingAssignment>;

export const DevUnpairResponse = z.object({
  unpaired: z.literal(true),
  unpairedAt: IsoTimestamp
});
export type DevUnpairResponse = z.infer<typeof DevUnpairResponse>;

export const DeviceCredential = z.object({
  deviceId: Uuid,
  organizationId: OrganizationId,
  locationId: LocationId.optional(),
  token: z.string().min(1),
  issuedAt: IsoTimestamp,
  expiresAt: IsoTimestamp.optional(),
  revokedAt: IsoTimestamp.optional(),
  capabilities: z.array(z.string()).min(1)
});
export type DeviceCredential = z.infer<typeof DeviceCredential>;
