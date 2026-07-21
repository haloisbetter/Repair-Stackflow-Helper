import { z } from "zod";
import { AssistantProfileSchema } from "../assistant/assistant-profile.js";
import { InstructionProfileSchema } from "../assistant/instruction-profile.js";
import { ToolPolicy } from "../tools/tool-authorization-service.js";

export const CONFIG_SCHEMA_VERSION = "1.0" as const;

export const RuntimePreferences = z
  .object({
    provider: z.enum(["ollama", "mock", "auto"]),
    executionTarget: z.enum(["local_on_this_machine", "remote_store_ai"]),
    modelRole: z.enum(["drafting", "extraction", "reasoning", "fast"]),
    ollamaEndpoint: z.string().min(1).max(512)
  })
  .strict();

export type RuntimePreferences = z.infer<typeof RuntimePreferences>;

export const PersistedAssistantConfiguration = z
  .object({
    schemaVersion: z.literal("1.0"),
    savedAt: z.string().datetime({ offset: true }),
    assistantProfile: AssistantProfileSchema,
    instructionProfile: InstructionProfileSchema,
    toolPolicies: z.array(ToolPolicy).min(0).max(50),
    runtimePreferences: RuntimePreferences
  })
  .strict();

export type PersistedAssistantConfiguration = z.infer<typeof PersistedAssistantConfiguration>;

export type ExportedAssistantConfiguration = PersistedAssistantConfiguration;

export const DEFAULT_RUNTIME_PREFERENCES: RuntimePreferences = {
  provider: "auto",
  executionTarget: "local_on_this_machine",
  modelRole: "drafting",
  ollamaEndpoint: "http://127.0.0.1:11434"
};
