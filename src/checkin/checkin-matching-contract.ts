import { z } from "zod";
import { Uuid, OrganizationId } from "../contracts/v1/common.js";

export const CustomerMatchRequest = z.object({
  organizationId: OrganizationId,
  phone: z.string().min(1).max(32).optional(),
  email: z.string().min(1).max(256).optional(),
  firstName: z.string().min(1).max(128).optional(),
  lastName: z.string().min(1).max(128).optional()
}).strict();
export type CustomerMatchRequest = z.infer<typeof CustomerMatchRequest>;

export const CustomerMatch = z.object({
  customerId: Uuid,
  firstName: z.string().min(1).max(128),
  lastName: z.string().min(1).max(128),
  phone: z.string().min(1).max(32).optional(),
  email: z.string().min(1).max(256).optional(),
  matchConfidence: z.enum(["high", "medium", "low"]),
  matchReason: z.string().min(1).max(256),
  isMock: z.boolean().default(false)
}).strict();
export type CustomerMatch = z.infer<typeof CustomerMatch>;

export const DeviceMatchRequest = z.object({
  organizationId: OrganizationId,
  serialNumber: z.string().min(1).max(128).optional(),
  manufacturer: z.string().min(1).max(128).optional(),
  model: z.string().min(1).max(256).optional()
}).strict();
export type DeviceMatchRequest = z.infer<typeof DeviceMatchRequest>;

export const DeviceMatch = z.object({
  deviceId: Uuid,
  serialNumber: z.string().min(1).max(128).optional(),
  manufacturer: z.string().min(1).max(128),
  model: z.string().min(1).max(256),
  matchConfidence: z.enum(["high", "medium", "low"]),
  matchReason: z.string().min(1).max(256),
  isMock: z.boolean().default(false)
}).strict();
export type DeviceMatch = z.infer<typeof DeviceMatch>;

export const CheckInProposalSubmission = z.object({
  sessionId: Uuid,
  organizationId: OrganizationId,
  proposalId: Uuid,
  submissionKey: z.string().min(16).max(256),
  reviewStatus: z.enum(["accepted", "accepted_with_edits"]),
  checkInFields: z.record(z.unknown()),
  symptomSummary: z.string().min(1).max(1024),
  employeeId: z.string().min(1).max(128).nullable(),
  overrideReason: z.string().max(256).nullable().default(null)
}).strict();
export type CheckInProposalSubmission = z.infer<typeof CheckInProposalSubmission>;

export const CheckInSubmissionAck = z.object({
  accepted: z.boolean(),
  submissionKey: z.string().min(16).max(256),
  receivedAt: z.string().datetime({ offset: true }),
  duplicate: z.boolean().default(false)
}).strict();
export type CheckInSubmissionAck = z.infer<typeof CheckInSubmissionAck>;
