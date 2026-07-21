import { FormatTechnicianNoteOutput } from "./contract.js";
import type { FormatTechnicianNoteOutput as Output } from "./contract.js";

export function normalizeOutput(raw: Output): Output {
  return {
    formattedNote: raw.formattedNote.trim(),
    customerReportedIssue: raw.customerReportedIssue.trim(),
    technicianFindings: raw.technicianFindings.map((f) => f.trim()).filter((f) => f.length > 0),
    recommendedNextStep: raw.recommendedNextStep.trim(),
    warnings: raw.warnings.map((w) => w.trim()).filter((w) => w.length > 0)
  };
}
