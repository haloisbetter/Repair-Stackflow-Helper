import { z } from "zod";
import {
  ApprovedTask,
  HelperId,
  IsoTimestamp,
  LocationId,
  OrganizationId,
  SCHEMA_VERSION,
  Uuid
} from "./common.js";

export const TechnicianNoteInput = z.object({
  technicianNote: z.string().min(1).max(4096),
  outputStyle: z.enum(["professional_repair_note"]).default("professional_repair_note")
});
export type TechnicianNoteInput = z.infer<typeof TechnicianNoteInput>;

export const CustomerUpdateInput = z.object({
  customerFirstName: z.string().min(1).max(128).optional(),
  deviceDescription: z.string().min(1).max(256).optional(),
  repairStatus: z.string().min(1).max(256).optional(),
  confirmedDiagnosis: z.object({
    value: z.string().min(1).max(1024),
    confirmationLevel: z.enum(["confirmed", "unconfirmed", "internal_only", "unknown"])
  }).optional(),
  confirmedWorkPerformed: z.object({
    value: z.string().min(1).max(1024),
    confirmationLevel: z.enum(["confirmed", "unconfirmed", "internal_only", "unknown"])
  }).optional(),
  confirmedEstimate: z.object({
    value: z.string().min(1).max(1024),
    confirmationLevel: z.enum(["confirmed", "unconfirmed", "internal_only", "unknown"])
  }).optional(),
  confirmedApprovalState: z.object({
    value: z.string().min(1).max(1024),
    confirmationLevel: z.enum(["confirmed", "unconfirmed", "internal_only", "unknown"])
  }).optional(),
  confirmedPartStatus: z.object({
    value: z.string().min(1).max(1024),
    confirmationLevel: z.enum(["confirmed", "unconfirmed", "internal_only", "unknown"])
  }).optional(),
  confirmedCompletionState: z.object({
    value: z.string().min(1).max(1024),
    confirmationLevel: z.enum(["confirmed", "unconfirmed", "internal_only", "unknown"])
  }).optional(),
  requiredCustomerAction: z.string().min(1).max(1024).optional(),
  nextExpectedStep: z.string().min(1).max(1024).optional(),
  employeeNotesSafeForCustomer: z.string().min(1).max(2048).optional(),
  communicationChannel: z.enum(["sms", "email", "phone_call", "in_person"]).default("sms"),
  requestedTone: z.enum(["professional", "friendly", "neutral"]).default("professional"),
  organizationInstructions: z.string().min(1).max(2000).optional()
});
export type CustomerUpdateInput = z.infer<typeof CustomerUpdateInput>;

export const JobRequest = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  jobId: Uuid,
  requestId: Uuid,
  task: ApprovedTask,
  organizationId: OrganizationId,
  locationId: LocationId.optional(),
  assignedHelperId: HelperId,
  createdAt: IsoTimestamp,
  expiresAt: IsoTimestamp,
  input: z.unknown()
}).strict();
export type JobRequest = z.infer<typeof JobRequest>;

export const JobClaimRequest = z.object({
  helperId: HelperId,
  approvedTasks: z.array(ApprovedTask).min(1)
});
export type JobClaimRequest = z.infer<typeof JobClaimRequest>;

export const JobClaimResponse = z.discriminatedUnion("claimed", [
  z.object({ claimed: z.literal(true), job: JobRequest }),
  z.object({ claimed: z.literal(false), reason: z.enum(["no_jobs", "not_paired"]) })
]);
export type JobClaimResponse = z.infer<typeof JobClaimResponse>;
