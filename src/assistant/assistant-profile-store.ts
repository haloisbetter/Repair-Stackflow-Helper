import { AssistantProfile, DEFAULT_ASSISTANT_PROFILE } from "./assistant-profile.js";
import { InstructionProfile, DEFAULT_INSTRUCTION_PROFILE } from "./instruction-profile.js";

export interface StoredProfile {
  assistant: AssistantProfile;
  instructions: InstructionProfile;
  updatedAt: string;
}

export class AssistantProfileStore {
  private profile: StoredProfile;
  private readonly initial: StoredProfile;

  constructor() {
    const now = new Date().toISOString();
    this.initial = {
      assistant: structuredClone(DEFAULT_ASSISTANT_PROFILE),
      instructions: structuredClone(DEFAULT_INSTRUCTION_PROFILE),
      updatedAt: now
    };
    this.profile = this.initial;
  }

  get(): StoredProfile {
    return this.profile;
  }

  validateAndStore(assistant: AssistantProfile, instructions: InstructionProfile): StoredProfile {
    this.profile = {
      assistant,
      instructions,
      updatedAt: new Date().toISOString()
    };
    return this.profile;
  }

  reset(): StoredProfile {
    this.profile = {
      assistant: structuredClone(DEFAULT_ASSISTANT_PROFILE),
      instructions: structuredClone(DEFAULT_INSTRUCTION_PROFILE),
      updatedAt: new Date().toISOString()
    };
    return this.profile;
  }

  version(): number {
    return this.profile.assistant.profileVersion;
  }
}
