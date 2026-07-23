import type { SummarizeCheckinSymptomsInput, SummarizeCheckinSymptomsOutput } from "./checkin-task-contracts.js";

export function summarizeSymptomsDeterministic(input: SummarizeCheckinSymptomsInput): SummarizeCheckinSymptomsOutput {
  const parts: string[] = [];
  const uncertainties: string[] = [];
  const warnings: string[] = [];

  if (input.deviceDescription) {
    parts.push(`Device: ${input.deviceDescription}.`);
  }

  if (input.customerReportedIssue) {
    parts.push(`Customer reports: ${input.customerReportedIssue}.`);
  } else if (input.transcriptSummary) {
    parts.push(`Customer reports: ${input.transcriptSummary.slice(0, 200)}.`);
  }

  if (input.whenIssueStarted) {
    parts.push(`Issue started ${input.whenIssueStarted}.`);
  }

  if (input.frequency) {
    parts.push(`Frequency: ${input.frequency}.`);
  }

  if (input.triggeringEvent) {
    parts.push(`Triggering event: ${input.triggeringEvent}.`);
  }

  if (input.troubleshootingAlreadyTried) {
    parts.push(`Customer tried: ${input.troubleshootingAlreadyTried}.`);
  }

  if (input.liquidExposure && input.liquidExposure !== "none") {
    parts.push(`Liquid exposure: ${input.liquidExposure}.`);
    if (input.liquidExposure === "unknown") {
      uncertainties.push("Liquid exposure status uncertain.");
    }
  }

  if (input.physicalDamage) {
    parts.push(`Physical damage: ${input.physicalDamage}.`);
  }

  if (input.dataImportance && input.dataImportance !== "low") {
    parts.push(`Data importance: ${input.dataImportance}.`);
    if (input.dataImportance === "critical") {
      warnings.push("Customer indicates critical data — verify backup before repair.");
    }
  }

  if (input.backupStatus && input.backupStatus !== "confirmed") {
    parts.push(`Backup status: ${input.backupStatus}.`);
    if (input.backupStatus === "not_confirmed" || input.backupStatus === "unknown") {
      warnings.push("Data backup not confirmed — data loss risk.");
    }
  }

  if (input.powerState && input.powerState !== "unknown") {
    parts.push(`Power state: ${input.powerState}.`);
  }

  if (uncertainties.length === 0) {
    uncertainties.push("Diagnosis pending — no confirmed diagnosis.");
  }

  const symptomSummary = parts.join(" ").slice(0, 1024);

  return {
    symptomSummary,
    primaryIssue: input.customerReportedIssue ?? "Customer reported device issue.",
    timeline: input.whenIssueStarted ?? "",
    reproducibleSymptoms: input.frequency ?? "",
    triggeringEvent: input.triggeringEvent ?? "",
    troubleshootingAttempted: input.troubleshootingAlreadyTried ?? "",
    liquidOrPhysicalExposure: [input.liquidExposure, input.physicalDamage].filter(Boolean).join("; "),
    dataConcerns: input.backupStatus ? `Backup: ${input.backupStatus}` : "",
    uncertainties,
    warnings
  };
}
