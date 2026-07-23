import type { AIProvider, AIExecutionResult, ApprovedAIExecutionRequest } from "./ai-provider.js";
import type { ModelAvailability, ProviderHealth } from "./provider-health.js";

export interface MockAIProviderOptions {
  readonly disabledInProduction?: boolean;
  readonly isProduction?: boolean;
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock" as const;
  private readonly disabledInProduction: boolean;
  private readonly isProduction: boolean;

  constructor(opts: MockAIProviderOptions = {}) {
    this.disabledInProduction = opts.disabledInProduction ?? true;
    this.isProduction = opts.isProduction ?? false;
  }

  private assertAllowed(): void {
    if (this.disabledInProduction && this.isProduction) {
      throw new Error("Mock AI provider is disabled in production configuration.");
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    this.assertAllowed();
    return {
      status: "available",
      endpoint: "mock://deterministic",
      latencyMs: 0,
      models: ["mock-formatter-v1", "mock-customer-update-v1"],
      checkedAt: new Date().toISOString()
    };
  }

  async checkModel(model: string): Promise<ModelAvailability> {
    this.assertAllowed();
    return { available: true, model };
  }

  async execute(request: ApprovedAIExecutionRequest): Promise<AIExecutionResult> {
    this.assertAllowed();
    const start = Date.now();
    let result: Record<string, unknown>;

    if (request.task === "draft_customer_update") {
      const input = extractCustomerUpdateInput(request.userPrompt);
      result = buildDeterministicCustomerUpdate(input);
    } else {
      const note = extractNoteFromUserPrompt(request.userPrompt);
      result = buildDeterministicTechnicianNote(note);
    }

    return {
      rawContent: JSON.stringify(result),
      provider: "mock",
      model: request.model,
      durationMs: Date.now() - start
    };
  }
}

function extractNoteFromUserPrompt(userPrompt: string): string {
  const marker = "===TECHNICIAN_NOTE_BEGIN===";
  const end = "===TECHNICIAN_NOTE_END===";
  const startIdx = userPrompt.indexOf(marker);
  const endIdx = userPrompt.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return "";
  return userPrompt.slice(startIdx + marker.length, endIdx).trim();
}

function extractCustomerUpdateInput(userPrompt: string): { facts: string[]; channel: string; hasConfirmedCompletion: boolean; hasConfirmedDiagnosis: boolean } {
  const marker = "===CUSTOMER_UPDATE_INPUT_BEGIN===";
  const end = "===CUSTOMER_UPDATE_INPUT_END===";
  const startIdx = userPrompt.indexOf(marker);
  const endIdx = userPrompt.indexOf(end);
  const content = startIdx !== -1 && endIdx !== -1
    ? userPrompt.slice(startIdx + marker.length, endIdx).trim()
    : "";

  const facts: string[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("===") && !trimmed.startsWith("The following")) {
      facts.push(trimmed);
    }
  }

  const hasConfirmedCompletion = facts.some((f) => /\[confirmed\].*complet/i.test(f));
  const hasConfirmedDiagnosis = facts.some((f) => /\[confirmed\].*diagnosis/i.test(f));
  const channelMatch = content.match(/Communication channel:\s*(\w+)/);
  const channel = channelMatch ? (channelMatch[1] ?? "sms") : "sms";

  return { facts, channel, hasConfirmedCompletion, hasConfirmedDiagnosis };
}

export function buildDeterministicTechnicianNote(note: string) {
  let safe = note.length > 0 ? note : "No technician note provided.";
  // Redact passwords and passcodes from the formatted note
  safe = safe.replace(/password\s+is\s+\S+/gi, "[redacted]").replace(/passcode\s+is\s+\S+/gi, "[redacted]");
  const lower = safe.toLowerCase();
  const warnings: string[] = [];
  const uncertainStatements: string[] = [];
  const omittedSensitiveContent: string[] = [];

  if (!note.trim()) warnings.push("Original technician note was empty.");
  if (lower.includes("maybe") || lower.includes("might") || lower.includes("not sure") || lower.includes("possibly")) {
    warnings.push("Original note contains uncertain language; diagnosis not confirmed.");
    uncertainStatements.push("Technician expressed uncertainty about diagnosis.");
  }
  if (/\bpassword\b/i.test(note)) {
    omittedSensitiveContent.push("password");
  }
  if (/\bpasscode\b/i.test(note)) {
    omittedSensitiveContent.push("passcode");
  }

  const customerIssue = deriveCustomerIssue(safe);
  const findings = deriveFindings(safe);

  return {
    formattedNote: `Formatted technician note: ${safe}`,
    customerReportedIssue: customerIssue,
    technicianFindings: findings,
    workPerformed: [] as string[],
    unresolvedIssues: [] as string[],
    recommendations: ["Perform verified diagnostics before concluding a repair."],
    warnings,
    uncertainStatements,
    omittedSensitiveContent,
    sourceFactsUsed: findings.slice(0, 10),
    sourceFactsExcluded: [] as string[],
    recommendedNextStep: "Perform verified diagnostics before concluding a repair."
  };
}

export function buildDeterministicCustomerUpdate(input: { facts: string[]; channel: string; hasConfirmedCompletion: boolean; hasConfirmedDiagnosis: boolean }) {
  const warnings: string[] = [];
  const uncertainOrMissingInformation: string[] = [];
  const prohibitedClaimsAvoided: string[] = [];
  const confirmedFactsUsed: string[] = [];
  const factsExcluded: string[] = [];

  const confirmedFacts = input.facts.filter((f) => f.includes("[confirmed]"));
  const unconfirmedFacts = input.facts.filter((f) => f.includes("[unconfirmed]"));
  const internalOnlyFacts = input.facts.filter((f) => f.includes("[internal_only]"));
  const unknownFacts = input.facts.filter((f) => f.includes("[unknown]") || (!f.includes("[confirmed]") && !f.includes("[unconfirmed]") && !f.includes("[internal_only]")));

  for (const f of confirmedFacts) confirmedFactsUsed.push(f);
  for (const f of unconfirmedFacts) {
    factsExcluded.push(f);
    uncertainOrMissingInformation.push("Unconfirmed fact excluded from draft.");
  }
  for (const f of internalOnlyFacts) {
    factsExcluded.push(f);
  }
  for (const f of unknownFacts) {
    factsExcluded.push(f);
    uncertainOrMissingInformation.push("Unknown fact excluded from draft.");
  }

  if (!input.hasConfirmedCompletion) {
    prohibitedClaimsAvoided.push("Did not claim repair is complete (not confirmed).");
    warnings.push("Repair completion not confirmed — draft uses cautious language.");
  }
  if (!input.hasConfirmedDiagnosis) {
    prohibitedClaimsAvoided.push("Did not claim diagnosis is final (not confirmed).");
    warnings.push("Diagnosis not confirmed — draft uses cautious language.");
  }

  const customerName = input.facts.find((f) => f.startsWith("Customer first name:"));
  const name = customerName ? (customerName.split(":")[1] ?? "").trim() || "there" : "there";

  const draft = `Hello ${name}, this is an update regarding your repair. We are currently working on your device. ${input.hasConfirmedDiagnosis ? "We have identified the issue." : "We are continuing diagnostics."} ${input.hasConfirmedCompletion ? "Your repair is complete." : "Your repair is still in progress."} Please contact us if you have any questions.`;

  return {
    customerFacingDraft: draft,
    subjectLine: input.channel === "email" ? "Repair Status Update" : undefined as string | undefined,
    communicationChannel: input.channel,
    confirmedFactsUsed,
    factsExcluded,
    requiredCustomerAction: "No action required at this time. Contact the shop if you have questions.",
    nextStep: "We will contact you with the next update when available.",
    warnings,
    uncertainOrMissingInformation,
    prohibitedClaimsAvoided
  };
}

function deriveCustomerIssue(note: string): string {
  const match = note.match(/customer (reports|says|states|complains of)[:\s]+([^.;]+)/i);
  if (match && match[2]) return match[2].trim();
  return note.length > 0 ? note.slice(0, 120) : "Customer-reported issue not specified.";
}

function deriveFindings(note: string): string[] {
  if (!note.trim()) return [];
  const sentences = note.split(/(?<=[.;])\s+/).filter((s) => s.trim().length > 0);
  const findings = sentences.filter((s) => !/customer (reports|says|states|complains)/i.test(s));
  return findings.slice(0, 8);
}
