import { z } from "zod";
import type { ProviderHealth } from "./provider-health.js";

export const ApprovedAIExecutionRequest = z.object({
  task: z.enum(["format_technician_note", "draft_customer_update"]),
  systemPrompt: z.string().min(1).max(8192),
  userPrompt: z.string().min(1).max(8192),
  model: z.string().min(1).max(128),
  maxResponseBytes: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
  responseFormat: z.enum(["json", "text"]).default("json")
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
