import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHelperContext } from "../../src/helper-context.js";
import { FileConfigurationStore } from "../../src/config/local-configuration-store.js";
import { DEFAULT_ASSISTANT_PROFILE } from "../../src/assistant/assistant-profile.js";
import { DEFAULT_INSTRUCTION_PROFILE } from "../../src/assistant/instruction-profile.js";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "helper-context-config-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("HelperContext configuration persistence", () => {
  it("uses defaults on first launch", async () => {
    const store = new FileConfigurationStore(testDir);
    const ctx = createHelperContext({}, store);
    const status = await ctx.loadConfiguration();
    expect(status.source).toBe("defaults");
    expect(ctx.getAssistantProfile().name).toBe("Helper");
  });

  it("profile survives restart simulation", async () => {
    const store1 = new FileConfigurationStore(testDir);
    const ctx1 = createHelperContext({}, store1);
    await ctx1.loadConfiguration();
    ctx1.updateAssistantProfile({
      ...DEFAULT_ASSISTANT_PROFILE,
      name: "Persistent Helper",
      profileVersion: 2
    });
    await ctx1.persistConfiguration();

    const store2 = new FileConfigurationStore(testDir);
    const ctx2 = createHelperContext({}, store2);
    await ctx2.loadConfiguration();
    expect(ctx2.getAssistantProfile().name).toBe("Persistent Helper");
  });

  it("instruction profile survives restart simulation", async () => {
    const store1 = new FileConfigurationStore(testDir);
    const ctx1 = createHelperContext({}, store1);
    await ctx1.loadConfiguration();
    ctx1.updateInstructionProfile({
      ...DEFAULT_INSTRUCTION_PROFILE,
      globalInstructions: "Custom instructions for testing.",
      profileVersion: 2
    });
    await ctx1.persistConfiguration();

    const store2 = new FileConfigurationStore(testDir);
    const ctx2 = createHelperContext({}, store2);
    await ctx2.loadConfiguration();
    expect(ctx2.getInstructionProfile().globalInstructions).toBe("Custom instructions for testing.");
  });

  it("tool policies survive restart simulation", async () => {
    const store1 = new FileConfigurationStore(testDir);
    const ctx1 = createHelperContext({}, store1);
    await ctx1.loadConfiguration();
    ctx1.updateToolPolicy("format_technician_note", { requiresConfirmation: true });
    await ctx1.persistConfiguration();

    const store2 = new FileConfigurationStore(testDir);
    const ctx2 = createHelperContext({}, store2);
    await ctx2.loadConfiguration();
    const policies = ctx2.getToolPolicies();
    const policy = policies.find((p) => p.toolId === "format_technician_note");
    expect(policy?.requiresConfirmation).toBe(true);
  });

  it("provider preferences survive restart simulation", async () => {
    const store1 = new FileConfigurationStore(testDir);
    const ctx1 = createHelperContext({}, store1);
    await ctx1.loadConfiguration();
    ctx1.setConfig({ ollamaEndpoint: "http://localhost:8080" });
    await ctx1.persistConfiguration();

    const store2 = new FileConfigurationStore(testDir);
    const ctx2 = createHelperContext({}, store2);
    await ctx2.loadConfiguration();
    expect(ctx2.getConfig().ollamaEndpoint).toBe("http://localhost:8080");
  });

  it("export contains no secrets or business content", async () => {
    const store = new FileConfigurationStore(testDir);
    const ctx = createHelperContext({}, store);
    await ctx.loadConfiguration();
    await ctx.persistConfiguration();
    const exported = await ctx.exportConfiguration();
    const json = JSON.stringify(exported);
    expect(json).not.toContain("technicianNote");
    expect(json).not.toContain("systemPrompt");
    expect(json).not.toContain("password");
    expect(json).not.toContain("token");
    expect(json).not.toContain("apiKey");
  });

  it("reset restores safe defaults", async () => {
    const store = new FileConfigurationStore(testDir);
    const ctx = createHelperContext({}, store);
    await ctx.loadConfiguration();
    ctx1_update(ctx);
    await ctx.persistConfiguration();
    await ctx.resetConfiguration();
    expect(ctx.getAssistantProfile().name).toBe("Helper");
    expect(ctx.getConfigurationStatus().source).toBe("defaults");
  });

  it("import applies without restart", async () => {
    const store = new FileConfigurationStore(testDir);
    const ctx = createHelperContext({}, store);
    await ctx.loadConfiguration();

    const importDoc = {
      schemaVersion: "1.0",
      savedAt: new Date().toISOString(),
      assistantProfile: { ...DEFAULT_ASSISTANT_PROFILE, name: "Imported Name" },
      instructionProfile: { ...DEFAULT_INSTRUCTION_PROFILE },
      toolPolicies: [],
      runtimePreferences: {
        provider: "mock",
        executionTarget: "local_on_this_machine",
        modelRole: "drafting",
        ollamaEndpoint: "http://127.0.0.1:11434"
      }
    };
    await ctx.importConfiguration(importDoc);
    expect(ctx.getAssistantProfile().name).toBe("Imported Name");
  });

  it("failed import leaves current configuration unchanged", async () => {
    const store = new FileConfigurationStore(testDir);
    const ctx = createHelperContext({}, store);
    await ctx.loadConfiguration();
    ctx.updateAssistantProfile({ ...DEFAULT_ASSISTANT_PROFILE, name: "Original", profileVersion: 2 });
    await ctx.persistConfiguration();

    const badImport = {
      schemaVersion: "1.0",
      savedAt: new Date().toISOString(),
      assistantProfile: { ...DEFAULT_ASSISTANT_PROFILE, name: "" },
      instructionProfile: { ...DEFAULT_INSTRUCTION_PROFILE },
      toolPolicies: [],
      runtimePreferences: {
        provider: "mock",
        executionTarget: "local_on_this_machine",
        modelRole: "drafting",
        ollamaEndpoint: "http://127.0.0.1:11434"
      }
    };
    await expect(ctx.importConfiguration(badImport)).rejects.toThrow();
    expect(ctx.getAssistantProfile().name).toBe("Original");
  });

  it("configuration status reports source after load", async () => {
    const store = new FileConfigurationStore(testDir);
    const ctx = createHelperContext({}, store);
    const status = await ctx.loadConfiguration();
    expect(status).toBeDefined();
    expect(ctx.getConfigurationStatus()).toBeDefined();
  });

  it("existing tool authorization remains unchanged after load", async () => {
    const store = new FileConfigurationStore(testDir);
    const ctx = createHelperContext({}, store);
    await ctx.loadConfiguration();
    const decision = ctx.authorizeTool({ toolId: "format_technician_note", confirmationProvided: true });
    expect(decision.authorized).toBe(true);
  });
});

function ctx1_update(ctx: ReturnType<typeof createHelperContext>) {
  ctx.updateAssistantProfile({ ...DEFAULT_ASSISTANT_PROFILE, name: "Temp", profileVersion: 2 });
}
