export type ExecutionTarget = "local_on_this_machine" | "remote_store_ai";
export type HelperRole = "workstation_agent" | "ai_host" | "combined";
export type ProviderSelection = "ollama" | "mock" | "auto";

export interface HelperConfig {
  readonly executionTarget: ExecutionTarget;
  readonly ollamaEndpoint: string;
  readonly approvedModel: string;
  readonly requestTimeoutMs: number;
  readonly maxRequestBytes: number;
  readonly maxResponseBytes: number;
  readonly mockProviderEnabled: boolean;
  readonly providerSelection: ProviderSelection;
  readonly helperRole: HelperRole;
}

export const DEFAULT_CONFIG: HelperConfig = {
  executionTarget: "local_on_this_machine",
  ollamaEndpoint: "http://127.0.0.1:11434",
  approvedModel: "llama3.2",
  requestTimeoutMs: 30_000,
  maxRequestBytes: 16_384,
  maxResponseBytes: 16_384,
  mockProviderEnabled: true,
  providerSelection: "auto",
  helperRole: "combined"
};

const ALLOWED_TARGETS = new Set<ExecutionTarget>(["local_on_this_machine", "remote_store_ai"]);
const ALLOWED_ROLES = new Set<HelperRole>(["workstation_agent", "ai_host", "combined"]);
const ALLOWED_PROVIDERS = new Set<ProviderSelection>(["ollama", "mock", "auto"]);

export function normalizeConfig(input: Partial<HelperConfig>): HelperConfig {
  const merged: HelperConfig = { ...DEFAULT_CONFIG, ...input };
  if (!ALLOWED_TARGETS.has(merged.executionTarget)) {
    throw new Error(`Invalid executionTarget: ${merged.executionTarget}`);
  }
  if (!ALLOWED_ROLES.has(merged.helperRole)) {
    throw new Error(`Invalid helperRole: ${merged.helperRole}`);
  }
  if (!ALLOWED_PROVIDERS.has(merged.providerSelection)) {
    throw new Error(`Invalid providerSelection: ${merged.providerSelection}`);
  }
  if (merged.requestTimeoutMs <= 0) throw new Error("requestTimeoutMs must be positive");
  if (merged.maxRequestBytes <= 0) throw new Error("maxRequestBytes must be positive");
  if (merged.maxResponseBytes <= 0) throw new Error("maxResponseBytes must be positive");
  if (merged.executionTarget === "remote_store_ai") {
    throw new Error("remote_store_ai is not configured in this MVP");
  }
  return merged;
}

export function isLoopbackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "::1";
  } catch {
    return false;
  }
}
