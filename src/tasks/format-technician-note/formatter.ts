import type { FormatTechnicianNoteOutput } from "./contract.js";

export function normalizeOutput(raw: FormatTechnicianNoteOutput): FormatTechnicianNoteOutput {
  return {
    formattedNote: raw.formattedNote.trim(),
    customerReportedIssue: raw.customerReportedIssue.trim(),
    technicianFindings: raw.technicianFindings.map((s) => s.trim()).filter((s) => s.length > 0),
    workPerformed: raw.workPerformed.map((s) => s.trim()).filter((s) => s.length > 0),
    unresolvedIssues: raw.unresolvedIssues.map((s) => s.trim()).filter((s) => s.length > 0),
    recommendations: raw.recommendations.map((s) => s.trim()).filter((s) => s.length > 0),
    warnings: raw.warnings.map((s) => s.trim()).filter((s) => s.length > 0),
    uncertainStatements: raw.uncertainStatements.map((s) => s.trim()).filter((s) => s.length > 0),
    omittedSensitiveContent: raw.omittedSensitiveContent.map((s) => s.trim()).filter((s) => s.length > 0),
    sourceFactsUsed: raw.sourceFactsUsed.map((s) => s.trim()).filter((s) => s.length > 0),
    sourceFactsExcluded: raw.sourceFactsExcluded.map((s) => s.trim()).filter((s) => s.length > 0),
    recommendedNextStep: raw.recommendedNextStep.trim()
  };
}
