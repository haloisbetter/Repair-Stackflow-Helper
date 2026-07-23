import { z } from "zod";
import { ApprovedTask, HelperId, IsoTimestamp, SCHEMA_VERSION, Uuid } from "./common.js";

export const TechnicianNoteResult = z.object({
  formattedNote: z.string().min(1).max(4096),
  customerReportedIssue: z.string().min(0).max(1024),
  technicianFindings: z.array(z.string().min(1).max(1024)).max(32),
  workPerformed: z.array(z.string().min(1).max(1024)).max(32).default([]),
  unresolvedIssues: z.array(z.string().min(1).max(1024)).max(32).default([]),
  recommendations: z.array(z.string().min(1).max(1024)).max(16).default([]),
  warnings: z.array(z.string().min(1).max(1024)).max(32),
  uncertainStatements: z.array(z.string().min(1).max(1024)).max(32).default([]),
  omittedSensitiveContent: z.array(z.string().min(1).max(256)).max(16).default([]),
  sourceFactsUsed: z.array(z.string().min(1).max(512)).max(64).default([]),
  sourceFactsExcluded: z.array(z.string().min(1).max(512)).max(64).default([]),
  recommendedNextStep: z.string().min(0).max(1024)
});
export type TechnicianNoteResult = z.infer<typeof TechnicianNoteResult>;

export const CustomerUpdateResult = z.object({
  customerFacingDraft: z.string().min(1).max(2048),
  subjectLine: z.string().min(0).max(256).optional(),
  communicationChannel: z.enum(["sms", "email", "phone_call", "in_person"]),
  confirmedFactsUsed: z.array(z.string().min(1).max(512)).max(32),
  factsExcluded: z.array(z.string().min(1).max(512)).max(32),
  requiredCustomerAction: z.string().min(0).max(1024),
  nextStep: z.string().min(0).max(1024),
  warnings: z.array(z.string().min(1).max(1024)).max(32),
  uncertainOrMissingInformation: z.array(z.string().min(1).max(1024)).max(32),
  prohibitedClaimsAvoided: z.array(z.string().min(1).max(512)).max(32)
});
export type CustomerUpdateResult = z.infer<typeof CustomerUpdateResult>;

export const TaskResult = z.union([TechnicianNoteResult, CustomerUpdateResult]);
export type TaskResult = z.infer<typeof TaskResult>;

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
  result: z.record(z.unknown()),
  timing: Timing
});
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
