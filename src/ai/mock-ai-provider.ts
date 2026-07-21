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
      models: ["mock-formatter-v1"],
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
    const note = extractNoteFromUserPrompt(request.userPrompt);
    const result = buildDeterministicResult(note);
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

export interface MockStructuredResult {
  formattedNote: string;
  customerReportedIssue: string;
  technicianFindings: string[];
  recommendedNextStep: string;
  warnings: string[];
}

export function buildDeterministicResult(note: string): MockStructuredResult {
  const safe = note.length > 0 ? note : "No technician note provided.";
  const lower = safe.toLowerCase();
  const warnings: string[] = [];
  if (!note.trim()) warnings.push("Original technician note was empty.");
  if (lower.includes("maybe") || lower.includes("might") || lower.includes("not sure")) {
    warnings.push("Original note contains uncertain language; diagnosis not confirmed.");
  }
  const customerIssue = deriveCustomerIssue(safe);
  const findings = deriveFindings(safe);
  return {
    formattedNote: `Formatted technician note: ${safe}`,
    customerReportedIssue: customerIssue,
    technicianFindings: findings,
    recommendedNextStep: "Perform verified diagnostics before concluding a repair.",
    warnings
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
