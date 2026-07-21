import { z } from "zod";
import { AssistantProfile } from "./assistant-profile.js";
import { InstructionProfile } from "./instruction-profile.js";
import { ToolRoleSchema } from "../tools/tool-authorization-service.js";

export const RuntimeAssistantConfiguration = z
  .object({
    assistant: AssistantProfile,
    instructions: InstructionProfile,
    enabledTools: z.array(z.string().min(1).max(128)).min(0).max(50),
    modelRole: z.enum(["drafting", "extraction", "reasoning", "fast"]),
    organizationId: z.string().min(1).max(128).optional(),
    compiledAt: z.string().datetime({ offset: true })
  })
  .strict();

export type RuntimeAssistantConfiguration = z.infer<typeof RuntimeAssistantConfiguration>;

export type ModelRole = z.infer<typeof RuntimeAssistantConfiguration>["modelRole"];

export const DEFAULT_MODEL_ROLE: ModelRole = "drafting";

export const DEFAULT_ENABLED_TOOLS: readonly string[] = ["format_technician_note"];

export type { ToolRole } from "../tools/tool-authorization-service.js";
export { ToolRoleSchema };
