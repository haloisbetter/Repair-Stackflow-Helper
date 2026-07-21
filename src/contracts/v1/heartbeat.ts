import { z } from "zod";
import { HelperId, IsoTimestamp, OrganizationId, LocationId } from "./common.js";

export const CapabilityReport = z.object({
  approvedTasks: z.array(z.string()).min(1),
  executionTarget: z.enum(["local_on_this_machine", "remote_store_ai"]),
  provider: z.enum(["ollama", "mock"]),
  model: z.string().min(1).max(128),
  maxRequestBytes: z.number().int().positive(),
  maxResponseBytes: z.number().int().positive()
});
export type CapabilityReport = z.infer<typeof CapabilityReport>;

export const HeartbeatRequest = z.object({
  helperId: HelperId,
  organizationId: OrganizationId,
  locationId: LocationId.optional(),
  sentAt: IsoTimestamp,
  capabilities: CapabilityReport,
  health: z.object({
    state: z.enum(["ready", "degraded", "unavailable"]),
    ollamaReachable: z.boolean(),
    modelAvailable: z.boolean()
  })
});
export type HeartbeatRequest = z.infer<typeof HeartbeatRequest>;

export const HeartbeatResponse = z.object({
  accepted: z.literal(true),
  receivedAt: IsoTimestamp
});
export type HeartbeatResponse = z.infer<typeof HeartbeatResponse>;
