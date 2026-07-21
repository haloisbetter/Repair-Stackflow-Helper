import { z } from "zod";
import type { ProviderHealth } from "./provider-health.js";

export const ApprovedAIExecutionRequest = z.object({
  task: z.enum(["format_technician_note"]),
  systemPrompt: z.string().min(1).max(8192),
  userPrompt: z.string().min(1).max(8192),
  model: z.string().min(1).max(128),
  maxResponseBytes: z.number().int().positive(),
  timeoutMs: z.number().int().positive()
});
export type ApprovedAIExecutionRequest = z.infer<typeof ApprovedAIExecutionRequest>;

export const AIExecutionResult = z.object({
  rawContent: z.string().min(1).max(16384),
  provider: z.enum(["ollama", "mock"]),
  model: z.string().min(1).max(128),
  durationMs: z.number().int().nonnegative()
});
export type AIExecutionResult = z.infer<typeof AIExecutionResult>;

export interface AIProvider {
  readonly name: "ollama" | "mock";
  healthCheck(): Promise<ProviderHealth>;
  checkModel(model: string): Promise<{ available: boolean; model: string }>;
  execute(request: ApprovedAIExecutionRequest): Promise<AIExecutionResult>;
}
