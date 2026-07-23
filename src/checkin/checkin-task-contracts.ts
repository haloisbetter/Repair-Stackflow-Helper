import { z } from "zod";

export const EXTRACT_CHECKIN_FIELDS_TASK_VERSION = "1.0" as const;
export const EXTRACT_CHECKIN_FIELDS_INPUT_SCHEMA_VERSION = "1.0" as const;
export const EXTRACT_CHECKIN_FIELDS_OUTPUT_SCHEMA_VERSION = "1.0" as const;
export const EXTRACT_CHECKIN_FIELDS_PROMPT_VERSION = "1.0" as const;

export const ExtractCheckinFieldsInput = z.object({
  transcriptSegments: z.array(z.object({
    segmentId: z.string().min(1).max(64),
    text: z.string().min(1).max(4096),
    speakerRole: z.enum(["customer", "employee", "unknown"]).default("unknown")
  })).max(500),
  employeeEnteredFacts: z.record(z.unknown()).default({}),
  existingConfirmedFields: z.array(z.object({
    field: z.string().min(1).max(128),
    value: z.unknown(),
    employeeConfirmed: z.boolean().default(false)
  })).default([])
}).strict();
export type ExtractCheckinFieldsInput = z.infer<typeof ExtractCheckinFieldsInput>;

export const ExtractedFieldOutput = z.object({
  field: z.string().min(1).max(128),
  value: z.unknown(),
  confidence: z.enum(["confirmed", "stated", "inferred", "unknown", "conflicting"]),
  sourceSegmentIds: z.array(z.string().min(1).max(64)).max(32),
  employeeConfirmed: z.boolean().default(false)
}).strict();

export const ExtractCheckinFieldsOutput = z.object({
  extractedFields: z.array(ExtractedFieldOutput).max(200),
  conflicts: z.array(z.object({
    field: z.string().min(1).max(128),
    values: z.array(z.unknown()).min(2).max(8),
    sourceSegmentIds: z.array(z.string().min(1).max(64)).max(32)
  })).max(50),
  missingFields: z.array(z.string().min(1).max(128)).max(100),
  warnings: z.array(z.string().min(1).max(1024)).max(32)
}).strict();
export type ExtractCheckinFieldsOutput = z.infer<typeof ExtractCheckinFieldsOutput>;

export const SUMMARIZE_CHECKIN_SYMPTOMS_TASK_VERSION = "1.0" as const;
export const SUMMARIZE_CHECKIN_SYMPTOMS_INPUT_SCHEMA_VERSION = "1.0" as const;
export const SUMMARIZE_CHECKIN_SYMPTOMS_OUTPUT_SCHEMA_VERSION = "1.0" as const;
export const SUMMARIZE_CHECKIN_SYMPTOMS_PROMPT_VERSION = "1.0" as const;

export const SummarizeCheckinSymptomsInput = z.object({
  customerReportedIssue: z.string().min(1).max(2048).optional(),
  whenIssueStarted: z.string().min(1).max(256).optional(),
  frequency: z.string().min(1).max(128).optional(),
  triggeringEvent: z.string().min(1).max(512).optional(),
  troubleshootingAlreadyTried: z.string().min(1).max(2048).optional(),
  liquidExposure: z.string().min(1).max(64).optional(),
  physicalDamage: z.string().min(1).max(512).optional(),
  dataImportance: z.string().min(1).max(64).optional(),
  backupStatus: z.string().min(1).max(64).optional(),
  powerState: z.string().min(1).max(64).optional(),
  deviceDescription: z.string().min(1).max(256).optional(),
  transcriptSummary: z.string().min(1).max(4096).optional()
}).strict();
export type SummarizeCheckinSymptomsInput = z.infer<typeof SummarizeCheckinSymptomsInput>;

export const SummarizeCheckinSymptomsOutput = z.object({
  symptomSummary: z.string().min(1).max(1024),
  primaryIssue: z.string().min(1).max(512),
  timeline: z.string().min(0).max(256),
  reproducibleSymptoms: z.string().min(0).max(512),
  triggeringEvent: z.string().min(0).max(256),
  troubleshootingAttempted: z.string().min(0).max(512),
  liquidOrPhysicalExposure: z.string().min(0).max(256),
  dataConcerns: z.string().min(0).max(256),
  uncertainties: z.array(z.string().min(1).max(256)).max(16),
  warnings: z.array(z.string().min(1).max(256)).max(16)
}).strict();
export type SummarizeCheckinSymptomsOutput = z.infer<typeof SummarizeCheckinSymptomsOutput>;
