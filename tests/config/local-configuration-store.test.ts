import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileConfigurationStore } from "../../src/config/local-configuration-store.js";
import {
  PersistedAssistantConfiguration,
  CONFIG_SCHEMA_VERSION,
  DEFAULT_RUNTIME_PREFERENCES
} from "../../src/config/persisted-configuration.js";
import { DEFAULT_ASSISTANT_PROFILE } from "../../src/assistant/assistant-profile.js";
import { DEFAULT_INSTRUCTION_PROFILE } from "../../src/assistant/instruction-profile.js";
import type { ToolPolicy } from "../../src/tools/tool-authorization-service.js";

let testDir: string;

function buildValidConfig(overrides?: Partial<PersistedAssistantConfiguration>): PersistedAssistantConfiguration {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    assistantProfile: { ...DEFAULT_ASSISTANT_PROFILE },
    instructionProfile: { ...DEFAULT_INSTRUCTION_PROFILE },
    toolPolicies: [],
    runtimePreferences: { ...DEFAULT_RUNTIME_PREFERENCES },
    ...overrides
  };
}

const defaultToolPolicy: ToolPolicy = {
  organizationId: "dev",
  toolId: "format_technician_note",
  enabled: true,
  allowedRoles: ["workstation_agent", "ai_host", "combined"],
  requiresConfirmation: false,
  executionLocation: "local"
};

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "helper-config-test-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("FileConfigurationStore", () => {
  it("returns defaults on first launch (no file)", async () => {
    const store = new FileConfigurationStore(testDir);
    const result = await store.load();
    expect(result.configuration).toBeNull();
    expect(result.source).toBe("defaults");
  });

  it("saves and loads a valid configuration", async () => {
    const store = new FileConfigurationStore(testDir);
    const config = buildValidConfig({ assistantProfile: { ...DEFAULT_ASSISTANT_PROFILE, name: "Custom" } });
    await store.save(config);
    const result = await store.load();
    expect(result.source).toBe("active");
    expect(result.configuration?.assistantProfile.name).toBe("Custom");
  });

  it("atomic save creates a valid active file", async () => {
    const store = new FileConfigurationStore(testDir);
    await store.save(buildValidConfig());
    const raw = await readFile(join(testDir, "configuration.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.schemaVersion).toBe("1.0");
    expect(parsed.assistantProfile).toBeDefined();
  });

  it("previous configuration is backed up on save", async () => {
    const store = new FileConfigurationStore(testDir);
    await store.save(buildValidConfig({ assistantProfile: { ...DEFAULT_ASSISTANT_PROFILE, name: "First" } }));
    await store.save(buildValidConfig({ assistantProfile: { ...DEFAULT_ASSISTANT_PROFILE, name: "Second" } }));
    const backupRaw = await readFile(join(testDir, "configuration.backup.json"), "utf-8");
    const backup = JSON.parse(backupRaw);
    expect(backup.assistantProfile.name).toBe("First");
  });

  it("corrupt active file loads valid backup", async () => {
    const store = new FileConfigurationStore(testDir);
    await store.save(buildValidConfig({ assistantProfile: { ...DEFAULT_ASSISTANT_PROFILE, name: "First" } }));
    await store.save(buildValidConfig({ assistantProfile: { ...DEFAULT_ASSISTANT_PROFILE, name: "Original" } }));
    await writeFile(join(testDir, "configuration.json"), "{ invalid json", "utf-8");
    const result = await store.load();
    expect(result.source).toBe("backup");
    expect(result.configuration?.assistantProfile.name).toBe("First");
    expect(result.warning).toContain("backup");
  });

  it("corrupt active and backup files use defaults", async () => {
    const store = new FileConfigurationStore(testDir);
    await store.save(buildValidConfig());
    await writeFile(join(testDir, "configuration.json"), "{ invalid", "utf-8");
    await writeFile(join(testDir, "configuration.backup.json"), "{ also invalid", "utf-8");
    const result = await store.load();
    expect(result.source).toBe("defaults");
    expect(result.configuration).toBeNull();
  });

  it("unsupported schema version rejected", async () => {
    const store = new FileConfigurationStore(testDir);
    await writeFile(
      join(testDir, "configuration.json"),
      JSON.stringify({ ...buildValidConfig(), schemaVersion: "9.9" }),
      "utf-8"
    );
    const result = await store.load();
    expect(result.source).toBe("defaults");
  });

  it("unknown top-level fields rejected", async () => {
    const store = new FileConfigurationStore(testDir);
    await writeFile(
      join(testDir, "configuration.json"),
      JSON.stringify({ ...buildValidConfig(), extraField: "bad" }),
      "utf-8"
    );
    const result = await store.load();
    expect(result.source).toBe("defaults");
  });

  it("invalid assistant profile rejected", async () => {
    const store = new FileConfigurationStore(testDir);
    const bad = buildValidConfig({ assistantProfile: { ...DEFAULT_ASSISTANT_PROFILE, name: "" } });
    await writeFile(join(testDir, "configuration.json"), JSON.stringify(bad), "utf-8");
    const result = await store.load();
    expect(result.source).toBe("defaults");
  });

  it("invalid instruction profile rejected", async () => {
    const store = new FileConfigurationStore(testDir);
    const bad = buildValidConfig({ instructionProfile: { ...DEFAULT_INSTRUCTION_PROFILE, globalInstructions: "" } });
    await writeFile(join(testDir, "configuration.json"), JSON.stringify(bad), "utf-8");
    const result = await store.load();
    expect(result.source).toBe("defaults");
  });

  it("unimplemented tool cannot be enabled through import", async () => {
    const store = new FileConfigurationStore(testDir);
    const bad = buildValidConfig({
      toolPolicies: [{ ...defaultToolPolicy, toolId: "draft_customer_update", enabled: true }]
    });
    await expect(store.importConfiguration(bad)).rejects.toThrow();
  });

  it("technician notes never appear in persisted configuration", async () => {
    const store = new FileConfigurationStore(testDir);
    await store.save(buildValidConfig());
    const raw = await readFile(join(testDir, "configuration.json"), "utf-8");
    expect(raw).not.toContain("technicianNote");
    expect(raw).not.toContain("technician_note");
  });

  it("raw prompts never appear in persisted configuration", async () => {
    const store = new FileConfigurationStore(testDir);
    await store.save(buildValidConfig());
    const raw = await readFile(join(testDir, "configuration.json"), "utf-8");
    expect(raw).not.toContain("systemPrompt");
    expect(raw).not.toContain("userPrompt");
  });

  it("secrets never appear in export", async () => {
    const store = new FileConfigurationStore(testDir);
    await store.save(buildValidConfig());
    const exported = await store.exportSanitized();
    const json = JSON.stringify(exported);
    expect(json).not.toContain("password");
    expect(json).not.toContain("token");
    expect(json).not.toContain("secret");
    expect(json).not.toContain("apiKey");
  });

  it("successful import applies without restart", async () => {
    const store = new FileConfigurationStore(testDir);
    const config = buildValidConfig({ assistantProfile: { ...DEFAULT_ASSISTANT_PROFILE, name: "Imported" } });
    const result = await store.importConfiguration(config);
    expect(result.assistantProfile.name).toBe("Imported");
    const loaded = await store.load();
    expect(loaded.configuration?.assistantProfile.name).toBe("Imported");
  });

  it("failed import leaves current configuration unchanged", async () => {
    const store = new FileConfigurationStore(testDir);
    await store.save(buildValidConfig({ assistantProfile: { ...DEFAULT_ASSISTANT_PROFILE, name: "Original" } }));
    const bad = { ...buildValidConfig(), assistantProfile: { ...DEFAULT_ASSISTANT_PROFILE, name: "" } };
    await expect(store.importConfiguration(bad)).rejects.toThrow();
    const loaded = await store.load();
    expect(loaded.configuration?.assistantProfile.name).toBe("Original");
  });

  it("reset restores safe defaults (removes files)", async () => {
    const store = new FileConfigurationStore(testDir);
    await store.save(buildValidConfig());
    await store.reset();
    const result = await store.load();
    expect(result.source).toBe("defaults");
    expect(result.configuration).toBeNull();
  });

  it("persistence errors are sanitized (no stack traces in messages)", async () => {
    const store = new FileConfigurationStore(testDir);
    const bad = { ...buildValidConfig(), assistantProfile: { ...DEFAULT_ASSISTANT_PROFILE, name: "" } };
    try {
      await store.importConfiguration(bad);
      expect.fail("Should have thrown");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).not.toMatch(/\n\s*at\s/);
      expect(msg).not.toContain("node:");
      expect(msg).not.toContain("stack");
    }
  });

  it("test storage path can be injected", async () => {
    const customDir = await mkdtemp(join(tmpdir(), "custom-config-"));
    const store = new FileConfigurationStore(customDir);
    await store.save(buildValidConfig());
    const result = await store.load();
    expect(result.source).toBe("active");
    await rm(customDir, { recursive: true, force: true });
  });

  it("configuration directory is outside the repository", async () => {
    const store = new FileConfigurationStore(testDir);
    const paths = store.getPaths();
    expect(paths.directory).not.toContain(process.cwd());
    expect(paths.activeFile).not.toContain(process.cwd());
  });

  it("rejects configuration directory inside the working directory", () => {
    expect(() => new FileConfigurationStore(process.cwd())).toThrow();
  });

  it("export includes only approved configuration fields", async () => {
    const store = new FileConfigurationStore(testDir);
    await store.save(buildValidConfig());
    const exported = await store.exportSanitized();
    expect(exported.schemaVersion).toBe("1.0");
    expect(exported.assistantProfile).toBeDefined();
    expect(exported.instructionProfile).toBeDefined();
    expect(exported.toolPolicies).toBeDefined();
    expect(exported.runtimePreferences).toBeDefined();
    expect(exported.savedAt).toBeDefined();
    const keys = Object.keys(exported);
    expect(keys).toHaveLength(6);
  });

  it("export on first launch returns safe defaults", async () => {
    const store = new FileConfigurationStore(testDir);
    const exported = await store.exportSanitized();
    expect(exported.assistantProfile.name).toBe("Helper");
    expect(exported.runtimePreferences.provider).toBe("auto");
  });

  it("import with unknown fields is rejected", async () => {
    const store = new FileConfigurationStore(testDir);
    const bad = { ...buildValidConfig(), unknownField: "bad" };
    await expect(store.importConfiguration(bad)).rejects.toThrow();
  });

  it("import creates backup before replacement", async () => {
    const store = new FileConfigurationStore(testDir);
    await store.save(buildValidConfig({ assistantProfile: { ...DEFAULT_ASSISTANT_PROFILE, name: "Original" } }));
    await store.importConfiguration(buildValidConfig({ assistantProfile: { ...DEFAULT_ASSISTANT_PROFILE, name: "New" } }));
    const backup = JSON.parse(await readFile(join(testDir, "configuration.backup.json"), "utf-8"));
    expect(backup.assistantProfile.name).toBe("Original");
  });

  it("atomic write does not leave temp file behind", async () => {
    const store = new FileConfigurationStore(testDir);
    await store.save(buildValidConfig());
    await expect(readFile(join(testDir, "configuration.tmp.json"), "utf-8")).rejects.toThrow();
  });

  it("runtime preferences survive save and load", async () => {
    const store = new FileConfigurationStore(testDir);
    const config = buildValidConfig({
      runtimePreferences: {
        provider: "mock",
        executionTarget: "local_on_this_machine",
        modelRole: "fast",
        ollamaEndpoint: "http://localhost:9999"
      }
    });
    await store.save(config);
    const result = await store.load();
    expect(result.configuration?.runtimePreferences.provider).toBe("mock");
    expect(result.configuration?.runtimePreferences.modelRole).toBe("fast");
    expect(result.configuration?.runtimePreferences.ollamaEndpoint).toBe("http://localhost:9999");
  });

  it("tool policies survive save and load", async () => {
    const store = new FileConfigurationStore(testDir);
    const config = buildValidConfig({
      toolPolicies: [
        { ...defaultToolPolicy, requiresConfirmation: true }
      ]
    });
    await store.save(config);
    const result = await store.load();
    expect(result.configuration?.toolPolicies).toHaveLength(1);
    expect(result.configuration?.toolPolicies[0]?.requiresConfirmation).toBe(true);
  });
});
