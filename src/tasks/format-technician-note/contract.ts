/**
 * Versioned schema contracts for the format_technician_note task.
 *
 * Output schema is evolved from the original 5-field version to include
 * uncertainty tracking, source-fact tracking, and sensitive-content reporting.
 */
import { z } from "zod";
import { SCHEMA_VERSION } from "../../contracts/v1/common.js";

export const FORMAT_TECHNICIAN_NOTE_TASK_VERSION = "1.1" as const;
export const FORMAT_TECHNICIAN_NOTE_INPUT_SCHEMA_VERSION = "1.0" as const;
export const FORMAT_TECHNICIAN_NOTE_OUTPUT_SCHEMA_VERSION = "1.1" as const;
export const FORMAT_TECHNICIAN_NOTE_PROMPT_VERSION = "1.1" as const;

export const FormatTechnicianNoteInput = z.object({
  technicianNote: z.string().min(1).max(4096),
  outputStyle: z.enum(["professional_repair_note"]).default("professional_repair_note")
}).strict();
export type FormatTechnicianNoteInput = z.infer<typeof FormatTechnicianNoteInput>;

export const FormatTechnicianNoteOutput = z.object({
  formattedNote: z.string().min(1).max(4096),
  customerReportedIssue: z.string().min(0).max(1024),
  technicianFindings: z.array(z.string().min(1).max(1024)).max(32),
  workPerformed: z.array(z.string().min(1).max(1024)).max(32),
  unresolvedIssues: z.array(z.string().min(1).max(1024)).max(32),
  recommendations: z.array(z.string().min(1).max(1024)).max(16),
  warnings: z.array(z.string().min(1).max(1024)).max(32),
  uncertainStatements: z.array(z.string().min(1).max(1024)).max(32),
  omittedSensitiveContent: z.array(z.string().min(1).max(256)).max(16),
  sourceFactsUsed: z.array(z.string().min(1).max(512)).max(64),
  sourceFactsExcluded: z.array(z.string().min(1).max(512)).max(64),
  recommendedNextStep: z.string().min(0).max(1024)
}).strict();
export type FormatTechnicianNoteOutput = z.infer<typeof FormatTechnicianNoteOutput>;

export const FORMAT_TECHNICIAN_NOTE_SCHEMA_VERSION = SCHEMA_VERSION;
