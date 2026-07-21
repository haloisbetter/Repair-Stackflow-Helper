import { z } from "zod";
import { ApprovedTask, HelperId, IsoTimestamp, SCHEMA_VERSION, Uuid } from "./common.js";

export const TechnicianNoteResult = z.object({
  formattedNote: z.string().min(1).max(4096),
  customerReportedIssue: z.string().min(1).max(1024),
  technicianFindings: z.array(z.string().min(1).max(1024)).max(32),
  recommendedNextStep: z.string().min(1).max(1024),
  warnings: z.array(z.string().min(1).max(1024)).max(32)
}).strict();
export type TechnicianNoteResult = z.infer<typeof TechnicianNoteResult>;

export const ResultStatus = z.enum(["completed", "failed"]);
export type ResultStatus = z.infer<typeof ResultStatus>;

export const Timing = z.object({
  startedAt: IsoTimestamp,
  completedAt: IsoTimestamp,
  durationMs: z.number().int().nonnegative()
});
export type Timing = z.infer<typeof Timing>;

export const JobResultSubmission = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  jobId: Uuid,
  requestId: Uuid,
  helperId: HelperId,
  task: ApprovedTask,
  status: ResultStatus,
  idempotencyKey: z.string().min(1).max(128),
  provider: z.enum(["ollama", "mock"]),
  executionTarget: z.enum(["local_on_this_machine", "remote_store_ai"]),
  model: z.string().min(1).max(128),
  result: TechnicianNoteResult,
  timing: Timing
}).strict();
export type JobResultSubmission = z.infer<typeof JobResultSubmission>;

export const JobFailureSubmission = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  jobId: Uuid,
  requestId: Uuid,
  helperId: HelperId,
  task: ApprovedTask,
  errorCode: z.string().min(1).max(64),
  retriable: z.boolean(),
  at: IsoTimestamp
});
export type JobFailureSubmission = z.infer<typeof JobFailureSubmission>;
