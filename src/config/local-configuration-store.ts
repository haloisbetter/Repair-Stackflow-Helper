import { mkdir, readFile, writeFile, rename, copyFile, unlink, stat } from "node:fs/promises";
import { dirname } from "node:path";
import {
  PersistedAssistantConfiguration,
  DEFAULT_RUNTIME_PREFERENCES,
  CONFIG_SCHEMA_VERSION
} from "./persisted-configuration.js";
import type { ExportedAssistantConfiguration } from "./persisted-configuration.js";
import { resolveConfigurationPaths, type ConfigurationPaths } from "./configuration-paths.js";
import { toolRegistry } from "../tools/tool-registry.js";

export type ConfigurationSource = "active" | "backup" | "defaults";

export interface ConfigurationLoadResult {
  configuration: PersistedAssistantConfiguration | null;
  source: ConfigurationSource;
  warning?: string;
}

export interface LocalConfigurationStore {
  load(): Promise<ConfigurationLoadResult>;
  save(configuration: PersistedAssistantConfiguration): Promise<void>;
  reset(): Promise<void>;
  exportSanitized(): Promise<ExportedAssistantConfiguration>;
  importConfiguration(input: unknown): Promise<PersistedAssistantConfiguration>;
  getPaths(): ConfigurationPaths;
}

function isOutsideCurrentWorkingDirectory(dir: string): boolean {
  const cwd = process.cwd();
  const normalized = dir.endsWith("/") ? dir.slice(0, -1) : dir;
  return !normalized.startsWith(cwd);
}

export class FileConfigurationStore implements LocalConfigurationStore {
  private readonly paths: ConfigurationPaths;

  constructor(directory?: string) {
    this.paths = resolveConfigurationPaths(directory);
    if (!isOutsideCurrentWorkingDirectory(this.paths.directory)) {
      throw new Error(
        "Configuration directory must be outside the repository working directory."
      );
    }
  }

  getPaths(): ConfigurationPaths {
    return this.paths;
  }

  async load(): Promise<ConfigurationLoadResult> {
    const active = await this.tryLoadFile(this.paths.activeFile);
    if (active.ok) {
      return { configuration: active.value, source: "active" };
    }
    if (active.warning) {
      const backup = await this.tryLoadFile(this.paths.backupFile);
      if (backup.ok) {
        return {
          configuration: backup.value,
          source: "backup",
          warning: "Active configuration was invalid; loaded from backup."
        };
      }
    }
    return {
      configuration: null,
      source: "defaults",
      warning: active.warning ?? "No configuration found; using safe defaults."
    };
  }

  private async tryLoadFile(
    filePath: string
  ): Promise<{ ok: true; value: PersistedAssistantConfiguration } | { ok: false; warning?: string }> {
    let raw: string;
    try {
      raw = await readFile(filePath, "utf-8");
    } catch {
      return { ok: false };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, warning: `Configuration file is not valid JSON: ${filePath}` };
    }
    const result = PersistedAssistantConfiguration.safeParse(parsed);
    if (!result.success) {
      return {
        ok: false,
        warning: `Configuration file failed validation: ${result.error.issues.map((i) => i.message).join("; ")}`
      };
    }
    if (!this.validateToolPolicies(result.data)) {
      return { ok: false, warning: "Configuration file contains unimplemented enabled tools." };
    }
    return { ok: true, value: result.data };
  }

  private validateToolPolicies(config: PersistedAssistantConfiguration): boolean {
    for (const policy of config.toolPolicies) {
      if (policy.enabled) {
        const tool = toolRegistry.resolve(policy.toolId);
        if (!tool || !tool.implemented) {
          return false;
        }
      }
    }
    return true;
  }

  async save(configuration: PersistedAssistantConfiguration): Promise<void> {
    const validated = PersistedAssistantConfiguration.parse(configuration);
    if (!this.validateToolPolicies(validated)) {
      throw new Error("Cannot save configuration with unimplemented enabled tools.");
    }
    await mkdir(this.paths.directory, { recursive: true });
    const json = JSON.stringify(validated, null, 2);
    await writeFile(this.paths.tempFile, json, "utf-8");
    await copyFile(this.paths.activeFile, this.paths.backupFile).catch(() => {
      // First save has no previous active file to back up
    });
    await rename(this.paths.tempFile, this.paths.activeFile);
  }

  async reset(): Promise<void> {
    await unlink(this.paths.activeFile).catch(() => {});
    await unlink(this.paths.backupFile).catch(() => {});
  }

  async exportSanitized(): Promise<ExportedAssistantConfiguration> {
    const result = await this.load();
    if (result.configuration) {
      return result.configuration;
    }
    return this.buildDefaults();
  }

  async importConfiguration(input: unknown): Promise<PersistedAssistantConfiguration> {
    const result = PersistedAssistantConfiguration.safeParse(input);
    if (!result.success) {
      throw new ImportValidationError(
        "configuration_import_rejected",
        `Import rejected: ${result.error.issues.map((i) => i.message).join("; ")}`
      );
    }
    if (result.data.schemaVersion !== CONFIG_SCHEMA_VERSION) {
      throw new ImportValidationError(
        "configuration_version_unsupported",
        `Unsupported schema version: ${result.data.schemaVersion}`
      );
    }
    if (!this.validateToolPolicies(result.data)) {
      throw new ImportValidationError(
        "configuration_import_rejected",
        "Import rejected: cannot enable unimplemented tools."
      );
    }
    const backup = await this.tryLoadFile(this.paths.activeFile);
    if (backup.ok) {
      await mkdir(this.paths.directory, { recursive: true });
      await writeFile(this.paths.backupFile, JSON.stringify(backup.value, null, 2), "utf-8").catch(() => {});
    }
    const stamped: PersistedAssistantConfiguration = {
      ...result.data,
      savedAt: new Date().toISOString()
    };
    await mkdir(this.paths.directory, { recursive: true });
    const json = JSON.stringify(stamped, null, 2);
    await writeFile(this.paths.tempFile, json, "utf-8");
    await rename(this.paths.tempFile, this.paths.activeFile);
    return stamped;
  }

  private buildDefaults(): ExportedAssistantConfiguration {
    return {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      assistantProfile: {
        name: "Helper",
        subtitle: "Repair Assistant",
        welcomeMessage: "Ready to help with today's repairs.",
        avatar: { type: "initials", value: "H" },
        appearance: { accentColor: "#2f8f83" },
        profileVersion: 1
      },
      instructionProfile: {
        globalInstructions:
          "You are a repair-shop assistant. Provide factual, concise help based only on the technician's input. Never invent facts, prices, or customer data.",
        toneRules: ["Professional and respectful", "Plain language, avoid jargon when possible"],
        formattingRules: ["Use clear section headings", "Keep paragraphs short"],
        prohibitedClaims: [
          "Do not guarantee repair outcomes",
          "Do not state pricing unless provided in the input"
        ],
        escalationRules: [
          "If safety is at risk, advise stopping work and consulting a supervisor",
          "If customer data is missing, ask the technician rather than guessing"
        ],
        profileVersion: 1
      },
      toolPolicies: [],
      runtimePreferences: { ...DEFAULT_RUNTIME_PREFERENCES }
    };
  }

  static createForTest(directory: string): FileConfigurationStore {
    return new FileConfigurationStore(directory);
  }
}

export class ImportValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ImportValidationError";
  }
}

export type { PersistedAssistantConfiguration, ExportedAssistantConfiguration } from "./persisted-configuration.js";
