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
  outputStyle: z.enum(["professional_repair_note"])
});
export type TechnicianNoteInput = z.infer<typeof TechnicianNoteInput>;

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
  input: TechnicianNoteInput
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
