import { describe, it, expect } from "vitest";
import { AssistantProfileService } from "../../src/assistant/assistant-profile-service.js";
import { AssistantProfileStore } from "../../src/assistant/assistant-profile-store.js";
import { DEFAULT_ASSISTANT_PROFILE } from "../../src/assistant/assistant-profile.js";
import { DEFAULT_INSTRUCTION_PROFILE } from "../../src/assistant/instruction-profile.js";

function makeService() {
  return new AssistantProfileService(new AssistantProfileStore());
}

describe("AssistantProfileService", () => {
  it("returns default assistant profile", () => {
    const svc = makeService();
    expect(svc.getAssistantProfile().name).toBe("Helper");
  });

  it("returns default instruction profile", () => {
    const svc = makeService();
    expect(svc.getInstructionProfile().globalInstructions).toContain("repair-shop");
  });

  it("updates assistant profile", () => {
    const svc = makeService();
    const updated = svc.updateAssistantProfile({
      ...DEFAULT_ASSISTANT_PROFILE,
      name: "Custom Assistant",
      profileVersion: 2
    });
    expect(updated.name).toBe("Custom Assistant");
    expect(svc.getAssistantProfile().name).toBe("Custom Assistant");
  });

  it("updates instruction profile", () => {
    const svc = makeService();
    const updated = svc.updateInstructionProfile({
      ...DEFAULT_INSTRUCTION_PROFILE,
      globalInstructions: "New instructions.",
      profileVersion: 2
    });
    expect(updated.globalInstructions).toBe("New instructions.");
    expect(svc.getInstructionProfile().globalInstructions).toBe("New instructions.");
  });

  it("rejects invalid assistant profile input", () => {
    const svc = makeService();
    expect(() => svc.updateAssistantProfile({ ...DEFAULT_ASSISTANT_PROFILE, name: "" })).toThrow();
  });

  it("rejects invalid instruction profile input", () => {
    const svc = makeService();
    expect(() => svc.updateInstructionProfile({ ...DEFAULT_INSTRUCTION_PROFILE, globalInstructions: "" })).toThrow();
  });

  it("resets to defaults", () => {
    const svc = makeService();
    svc.updateAssistantProfile({ ...DEFAULT_ASSISTANT_PROFILE, name: "Temp", profileVersion: 2 });
    svc.reset();
    expect(svc.getAssistantProfile().name).toBe("Helper");
  });

  it("compileRuntimeConfig returns assistant and instructions", () => {
    const svc = makeService();
    const config = svc.compileRuntimeConfig();
    expect(config.assistant.name).toBe("Helper");
    expect(config.instructions.globalInstructions).toContain("repair-shop");
  });

  it("compileRuntimeConfig includes enabledTools", () => {
    const svc = makeService();
    const config = svc.compileRuntimeConfig({ enabledTools: ["format_technician_note"] });
    expect(config.enabledTools).toContain("format_technician_note");
  });

  it("compileRuntimeConfig includes organizationId when provided", () => {
    const svc = makeService();
    const config = svc.compileRuntimeConfig({ organizationId: "org-123" });
    expect(config.organizationId).toBe("org-123");
  });

  it("compileRuntimeConfig omits organizationId when not provided", () => {
    const svc = makeService();
    const config = svc.compileRuntimeConfig();
    expect(config.organizationId).toBeUndefined();
  });

  it("compileRuntimeConfig includes compiledAt timestamp", () => {
    const svc = makeService();
    const config = svc.compileRuntimeConfig();
    expect(config.compiledAt).toBeDefined();
    expect(new Date(config.compiledAt).toString()).not.toBe("Invalid Date");
  });
});

describe("AssistantProfileStore", () => {
  it("tracks version after update", () => {
    const store = new AssistantProfileStore();
    store.validateAndStore(
      { ...DEFAULT_ASSISTANT_PROFILE, profileVersion: 5 },
      DEFAULT_INSTRUCTION_PROFILE
    );
    expect(store.version()).toBe(5);
  });

  it("reset restores defaults", () => {
    const store = new AssistantProfileStore();
    store.validateAndStore(
      { ...DEFAULT_ASSISTANT_PROFILE, name: "Temp", profileVersion: 2 },
      DEFAULT_INSTRUCTION_PROFILE
    );
    const reset = store.reset();
    expect(reset.assistant.name).toBe("Helper");
  });
});
