import { AssistantProfileSchema, DEFAULT_ASSISTANT_PROFILE } from "./assistant-profile.js";
import type { AssistantProfile } from "./assistant-profile.js";
import {
  InstructionProfileSchema,
  DEFAULT_INSTRUCTION_PROFILE
} from "./instruction-profile.js";
import type { InstructionProfile } from "./instruction-profile.js";
import { AssistantProfileStore } from "./assistant-profile-store.js";
import {
  RuntimeAssistantConfiguration,
  DEFAULT_MODEL_ROLE,
  DEFAULT_ENABLED_TOOLS
} from "./runtime-assistant-config.js";

export interface CompileParams {
  enabledTools?: readonly string[];
  modelRole?: RuntimeAssistantConfiguration["modelRole"];
  organizationId?: string;
}

export class AssistantProfileService {
  constructor(private readonly store: AssistantProfileStore) {}

  getAssistantProfile(): AssistantProfile {
    return this.store.get().assistant;
  }

  getInstructionProfile(): InstructionProfile {
    return this.store.get().instructions;
  }

  updateAssistantProfile(input: unknown): AssistantProfile {
    const parsed = AssistantProfileSchema.parse(input);
    const current = this.store.get();
    this.store.validateAndStore(parsed, current.instructions);
    return parsed;
  }

  updateInstructionProfile(input: unknown): InstructionProfile {
    const parsed = InstructionProfileSchema.parse(input);
    const current = this.store.get();
    this.store.validateAndStore(current.assistant, parsed);
    return parsed;
  }

  reset(): void {
    this.store.reset();
  }

  compileRuntimeConfig(params: CompileParams = {}): RuntimeAssistantConfiguration {
    const stored = this.store.get();
    const config: RuntimeAssistantConfiguration = {
      assistant: stored.assistant,
      instructions: stored.instructions,
      enabledTools: params.enabledTools ? Array.from(params.enabledTools) : Array.from(DEFAULT_ENABLED_TOOLS),
      modelRole: params.modelRole ?? DEFAULT_MODEL_ROLE,
      compiledAt: new Date().toISOString()
    };
    if (params.organizationId !== undefined) {
      config.organizationId = params.organizationId;
    }
    return config;
  }
}

export function createDefaultAssistantProfileService(): AssistantProfileService {
  return new AssistantProfileService(new AssistantProfileStore());
}

export { DEFAULT_ASSISTANT_PROFILE, DEFAULT_INSTRUCTION_PROFILE };
