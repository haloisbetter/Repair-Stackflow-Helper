import { z } from "zod";
import { SCHEMA_VERSION } from "../../contracts/v1/common.js";

export const FormatTechnicianNoteInput = z.object({
  technicianNote: z.string().min(1).max(4096),
  outputStyle: z.enum(["professional_repair_note"])
});
export type FormatTechnicianNoteInput = z.infer<typeof FormatTechnicianNoteInput>;

export const FormatTechnicianNoteOutput = z.object({
  formattedNote: z.string().min(1).max(4096),
  customerReportedIssue: z.string().min(1).max(1024),
  technicianFindings: z.array(z.string().min(1).max(1024)).max(32),
  recommendedNextStep: z.string().min(1).max(1024),
  warnings: z.array(z.string().min(1).max(1024)).max(32)
}).strict();
export type FormatTechnicianNoteOutput = z.infer<typeof FormatTechnicianNoteOutput>;

export const FORMAT_TECHNICIAN_NOTE_SCHEMA_VERSION = SCHEMA_VERSION;
