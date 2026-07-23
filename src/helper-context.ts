import { randomUUID } from "node:crypto";
import type { HelperConfig, ProviderSelection } from "./config/helper-config.js";
import { DEFAULT_CONFIG, normalizeConfig } from "./config/helper-config.js";
import type { HelperIdentity, PairingState } from "./contracts/v1/pairing.js";
import { StateMachine, isProcessingCapable } from "./helper/helper-state.js";
import { createDevelopmentIdentity, withState } from "./helper/helper-identity.js";
import { createDevPairingService, type PairingService, type PairingResult } from "./helper/pairing-service.js";
import { HealthService, type HelperHealth } from "./helper/health-service.js";
import { OllamaProvider } from "./ai/ollama-provider.js";
import { MockAIProvider } from "./ai/mock-ai-provider.js";
import type { AIProvider } from "./ai/ai-provider.js";
import { TaskRegistry } from "./tasks/task-registry.js";
import { formatTechnicianNoteTemplate } from "./tasks/format-technician-note/prompt-template.js";
import { draftCustomerUpdateTemplate } from "./tasks/draft-customer-update/prompt-template.js";
import { TemporaryJobStore } from "./jobs/temporary-job-store.js";
import { JobRunner } from "./jobs/job-runner.js";
import { TemporaryProposalStore } from "./review/temporary-proposal-store.js";
import { DiagnosticService } from "./diagnostics/diagnostic-service.js";
import { ProtocolError } from "./contracts/v1/errors.js";
import { ToolRegistry, toolRegistry } from "./tools/tool-registry.js";
import { AssistantProfileService, createDefaultAssistantProfileService } from "./assistant/assistant-profile-service.js";
import { AssistantProfileStore } from "./assistant/assistant-profile-store.js";
import { type ToolPolicy, type ToolRole, type AuthorizationDecision } from "./tools/tool-authorization-service.js";
import { authorizeToolUse } from "./tools/tool-authorization-service.js";
import { DEFAULT_ENABLED_TOOLS, type RuntimeAssistantConfiguration } from "./assistant/runtime-assistant-config.js";
import { type AssistantProfile } from "./assistant/assistant-profile.js";
import { type InstructionProfile } from "./assistant/instruction-profile.js";
import {
  type PersistedAssistantConfiguration,
  type ExportedAssistantConfiguration,
  CONFIG_SCHEMA_VERSION,
  DEFAULT_RUNTIME_PREFERENCES
} from "./config/persisted-configuration.js";
import {
  FileConfigurationStore,
  type LocalConfigurationStore,
  type ConfigurationSource,
  type ConfigurationLoadResult
} from "./config/local-configuration-store.js";

export interface ConfigurationStatus {
  loaded: boolean;
  schemaVersion: string | null;
  source: ConfigurationSource;
  lastSave: string | null;
  persistenceHealthy: boolean;
  lastPersistenceErrorCode: string | null;
  warning: string | null;
}

export interface HelperContext {
  config: HelperConfig;
  identity: HelperIdentity;
  state: StateMachine;
  pairing: PairingService;
  provider: AIProvider;
  healthService: HealthService;
  taskRegistry: TaskRegistry;
  store: TemporaryJobStore;
  proposalStore: TemporaryProposalStore;
  jobRunner: JobRunner;
  diagnostics: DiagnosticService;
  assistantProfileService: AssistantProfileService;
  toolRegistry: ToolRegistry;
  configurationStore: LocalConfigurationStore;
  configurationStatus: ConfigurationStatus;
  lastHealth: HelperHealth | null;
  lastPairing: PairingResult | null;
  setConfig(next: Partial<HelperConfig>): void;
  setProviderSelection(sel: ProviderSelection): void;
  pair(code: string): Promise<PairingResult>;
  unpair(): Promise<void>;
  refreshHealth(): Promise<HelperHealth>;
  getHealth(): HelperHealth | null;
  getIdentity(): HelperIdentity;
  getConfig(): HelperConfig;
  getStore(): TemporaryJobStore;
  getAssistantProfile(): AssistantProfile;
  getInstructionProfile(): InstructionProfile;
  updateAssistantProfile(input: unknown): AssistantProfile;
  updateInstructionProfile(input: unknown): InstructionProfile;
  resetAssistantProfile(): void;
  getRuntimeConfig(): RuntimeAssistantConfiguration;
  listTools(): ReturnType<ToolRegistry["list"]>;
  getToolPolicies(): ToolPolicy[];
  updateToolPolicy(toolId: string, input: unknown): ToolPolicy;
  authorizeTool(params: {
    toolId: string;
    confirmationProvided: boolean;
  }): AuthorizationDecision;
  loadConfiguration(): Promise<ConfigurationStatus>;
  persistConfiguration(): Promise<void>;
  exportConfiguration(): Promise<ExportedAssistantConfiguration>;
  importConfiguration(input: unknown): Promise<void>;
  resetConfiguration(): Promise<void>;
  getConfigurationStatus(): ConfigurationStatus;
}

function buildDefaultConfigurationStatus(): ConfigurationStatus {
  return {
    loaded: false,
    schemaVersion: null,
    source: "defaults",
    lastSave: null,
    persistenceHealthy: true,
    lastPersistenceErrorCode: null,
    warning: null
  };
}

export function createHelperContext(
  initialConfig: Partial<HelperConfig> = {},
  configStore?: LocalConfigurationStore
): HelperContext {
  let config = normalizeConfig({ ...DEFAULT_CONFIG, ...initialConfig });
  const state = new StateMachine();
  let identity = createDevelopmentIdentity(config.helperRole);
  const pairing = createDevPairingService();
  const store = new TemporaryJobStore();
  const proposalStore = new TemporaryProposalStore();

  let providerSelection: ProviderSelection = config.providerSelection;
  let mockProvider = new MockAIProvider({ isProduction: false });
  let ollamaProvider = new OllamaProvider({ endpoint: config.ollamaEndpoint });
  let provider = selectProvider(providerSelection, ollamaProvider, mockProvider);

  let healthService = new HealthService(config, provider);
  const assistantProfileStore = new AssistantProfileStore();
  const assistantProfileService = createDefaultAssistantProfileService();
  const tools = toolRegistry;
  let toolPolicies: Map<string, ToolPolicy> = new Map([
    [
      "format_technician_note",
      {
        organizationId: identity.organizationId ?? "dev",
        toolId: "format_technician_note",
        enabled: true,
        allowedRoles: ["workstation_agent", "ai_host", "combined"],
        requiresConfirmation: false,
        executionLocation: "local"
      }
    ],
    [
      "draft_customer_update",
      {
        organizationId: identity.organizationId ?? "dev",
        toolId: "draft_customer_update",
        enabled: true,
        allowedRoles: ["workstation_agent", "ai_host", "combined"],
        requiresConfirmation: true,
        executionLocation: "local"
      }
    ]
  ]);
  let enabledTools: readonly string[] = Array.from(DEFAULT_ENABLED_TOOLS);
  const taskRegistry = new TaskRegistry(
    new Map<string, any>([
      ["format_technician_note", formatTechnicianNoteTemplate],
      ["draft_customer_update", draftCustomerUpdateTemplate]
    ]),
    tools
  );
  let jobRunner = new JobRunner({
    identity,
    config,
    provider,
    taskRegistry,
    store,
    toolRegistry: tools,
    enabledTools: () => enabledTools,
    getToolPolicy: (toolId: string) => toolPolicies.get(toolId) ?? null,
    assistantProfileService,
    proposalStore
  });
  let diagnostics = new DiagnosticService(
    () => identity,
    () => config,
    () => lastHealth,
    () => store,
    () => configurationStatus
  );
  let lastHealth: HelperHealth | null = null;
  let lastPairing: PairingResult | null = null;

  const configurationStore: LocalConfigurationStore = configStore ?? new FileConfigurationStore();
  let configurationStatus: ConfigurationStatus = buildDefaultConfigurationStatus();

  function rebuild() {
    provider = selectProvider(providerSelection, ollamaProvider, mockProvider);
    healthService = new HealthService(config, provider);
    jobRunner = new JobRunner({
      identity,
      config,
      provider,
      taskRegistry,
      store,
      toolRegistry: tools,
      enabledTools: () => enabledTools,
      getToolPolicy: (toolId: string) => toolPolicies.get(toolId) ?? null,
      assistantProfileService,
      proposalStore
    });
  }

  function buildPersistedConfiguration(): PersistedAssistantConfiguration {
    return {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      assistantProfile: assistantProfileService.getAssistantProfile(),
      instructionProfile: assistantProfileService.getInstructionProfile(),
      toolPolicies: Array.from(toolPolicies.values()),
      runtimePreferences: {
        provider: providerSelection,
        executionTarget: config.executionTarget,
        modelRole: "drafting",
        ollamaEndpoint: config.ollamaEndpoint,
        runtimeMode: "development",
        backendBaseUrl: "http://127.0.0.1:8787",
        pollingIntervalMs: 10000,
        heartbeatIntervalMs: 30000,
        backendTimeoutMs: 15000,
        maxRetryAttempts: 5
      }
    };
  }

  function applyPersistedConfiguration(persisted: PersistedAssistantConfiguration): void {
    assistantProfileService.updateAssistantProfile(persisted.assistantProfile);
    assistantProfileService.updateInstructionProfile(persisted.instructionProfile);

    toolPolicies = new Map();
    enabledTools = [];
    for (const policy of persisted.toolPolicies) {
      toolPolicies.set(policy.toolId, policy);
      if (policy.enabled) {
        enabledTools = [...enabledTools, policy.toolId];
      }
    }

    if (!toolPolicies.has("format_technician_note")) {
      const defaultPolicy: ToolPolicy = {
        organizationId: identity.organizationId ?? "dev",
        toolId: "format_technician_note",
        enabled: true,
        allowedRoles: ["workstation_agent", "ai_host", "combined"],
        requiresConfirmation: false,
        executionLocation: "local"
      };
      toolPolicies.set("format_technician_note", defaultPolicy);
      if (!enabledTools.includes("format_technician_note")) {
        enabledTools = [...enabledTools, "format_technician_note"];
      }
    }
    if (!toolPolicies.has("draft_customer_update")) {
      const defaultPolicy: ToolPolicy = {
        organizationId: identity.organizationId ?? "dev",
        toolId: "draft_customer_update",
        enabled: true,
        allowedRoles: ["workstation_agent", "ai_host", "combined"],
        requiresConfirmation: true,
        executionLocation: "local"
      };
      toolPolicies.set("draft_customer_update", defaultPolicy);
      if (!enabledTools.includes("draft_customer_update")) {
        enabledTools = [...enabledTools, "draft_customer_update"];
      }
    }

    const prefs = persisted.runtimePreferences;
    providerSelection = prefs.provider;
    config = normalizeConfig({
      ...config,
      executionTarget: prefs.executionTarget,
      ollamaEndpoint: prefs.ollamaEndpoint,
      providerSelection: prefs.provider
    });
    ollamaProvider = new OllamaProvider({ endpoint: config.ollamaEndpoint });
    rebuild();
  }

  return {
    get config() { return config; },
    get identity() { return identity; },
    get state() { return state; },
    get pairing() { return pairing; },
    get provider() { return provider; },
    get healthService() { return healthService; },
    get taskRegistry() { return taskRegistry; },
    get proposalStore() { return proposalStore; },
    get store() { return store; },
    get jobRunner() { return jobRunner; },
    get diagnostics() { return diagnostics; },
    get assistantProfileService() { return assistantProfileService; },
    get toolRegistry() { return tools; },
    get configurationStore() { return configurationStore; },
    get configurationStatus() { return configurationStatus; },
    get lastHealth() { return lastHealth; },
    get lastPairing() { return lastPairing; },
    setConfig(next: Partial<HelperConfig>) {
      config = normalizeConfig({ ...config, ...next });
      ollamaProvider = new OllamaProvider({ endpoint: config.ollamaEndpoint });
      rebuild();
    },
    setProviderSelection(sel: ProviderSelection) {
      providerSelection = sel;
      rebuild();
    },
    async pair(code: string): Promise<PairingResult> {
      state.transition("pairing");
      identity = withState(identity, "pairing");
      try {
        const result = await pairing.pair(code);
        identity = {
          ...identity,
          organizationId: result.organizationId,
          locationId: result.locationId,
          role: result.helperRole,
          pairingState: "paired_ready"
        };
        state.force("paired_ready");
        lastPairing = result;
        rebuild();
        return result;
      } catch (e) {
        state.reset();
        identity = {
          ...identity,
          organizationId: undefined,
          locationId: undefined,
          pairingState: "unpaired"
        };
        throw e;
      }
    },
    async unpair(): Promise<void> {
      await pairing.unpair();
      identity = {
        ...identity,
        organizationId: undefined,
        locationId: undefined,
        pairingState: "unpaired"
      };
      state.reset();
      lastPairing = null;
      store.clearAllResults();
      rebuild();
    },
    async refreshHealth(): Promise<HelperHealth> {
      lastHealth = await healthService.check();
      return lastHealth;
    },
    getHealth(): HelperHealth | null { return lastHealth; },
    getIdentity(): HelperIdentity { return identity; },
    getConfig(): HelperConfig { return config; },
    getStore(): TemporaryJobStore { return store; },
    getAssistantProfile(): AssistantProfile { return assistantProfileService.getAssistantProfile(); },
    getInstructionProfile(): InstructionProfile { return assistantProfileService.getInstructionProfile(); },
    updateAssistantProfile(input: unknown): AssistantProfile {
      const updated = assistantProfileService.updateAssistantProfile(input);
      rebuild();
      return updated;
    },
    updateInstructionProfile(input: unknown): InstructionProfile {
      const updated = assistantProfileService.updateInstructionProfile(input);
      rebuild();
      return updated;
    },
    resetAssistantProfile(): void {
      assistantProfileService.reset();
      enabledTools = Array.from(DEFAULT_ENABLED_TOOLS);
      rebuild();
    },
    getRuntimeConfig(): RuntimeAssistantConfiguration {
      const params: { enabledTools: readonly string[]; organizationId?: string } = { enabledTools };
      if (identity.organizationId) params.organizationId = identity.organizationId;
      return assistantProfileService.compileRuntimeConfig(params);
    },
    listTools(): ReturnType<ToolRegistry["list"]> { return tools.list(); },
    getToolPolicies(): ToolPolicy[] { return Array.from(toolPolicies.values()); },
    updateToolPolicy(toolId: string, input: unknown): ToolPolicy {
      const tool = tools.resolve(toolId);
      if (!tool) throw new ProtocolError("tool_disabled_by_policy", `Unknown tool: ${toolId}`, false);
      const base = toolPolicies.get(toolId);
      const execLoc = (input as { executionLocation?: string })?.executionLocation ?? base?.executionLocation ?? tool.executionLocation;
      const merged: ToolPolicy = {
        organizationId: identity.organizationId ?? "dev",
        toolId,
        enabled: (input as { enabled?: boolean })?.enabled ?? base?.enabled ?? false,
        allowedRoles: (input as { allowedRoles?: ToolRole[] })?.allowedRoles ?? base?.allowedRoles ?? [],
        requiresConfirmation: (input as { requiresConfirmation?: boolean })?.requiresConfirmation ?? base?.requiresConfirmation ?? false,
        executionLocation: execLoc as "local" | "repair_stackflow" | "hybrid"
      };
      toolPolicies.set(toolId, merged);
      if (merged.enabled && !enabledTools.includes(toolId)) {
        enabledTools = [...enabledTools, toolId];
      } else if (!merged.enabled) {
        enabledTools = enabledTools.filter((t) => t !== toolId);
      }
      rebuild();
      return merged;
    },
    authorizeTool(params: { toolId: string; confirmationProvided: boolean }): AuthorizationDecision {
      const policy = toolPolicies.get(params.toolId);
      if (!policy) {
        return { authorized: false, errorCode: "tool_disabled_by_policy", reason: `No policy for ${params.toolId}` };
      }
      return authorizeToolUse({
        toolId: params.toolId,
        role: identity.role as ToolRole,
        toolRegistry: tools,
        enabledTools,
        policy,
        confirmationProvided: params.confirmationProvided
      });
    },
    async loadConfiguration(): Promise<ConfigurationStatus> {
      const result: ConfigurationLoadResult = await configurationStore.load();
      if (result.configuration) {
        applyPersistedConfiguration(result.configuration);
        configurationStatus = {
          loaded: true,
          schemaVersion: result.configuration.schemaVersion,
          source: result.source,
          lastSave: result.configuration.savedAt,
          persistenceHealthy: true,
          lastPersistenceErrorCode: null,
          warning: result.warning ?? null
        };
      } else {
        configurationStatus = {
          loaded: false,
          schemaVersion: null,
          source: "defaults",
          lastSave: null,
          persistenceHealthy: true,
          lastPersistenceErrorCode: null,
          warning: result.warning ?? null
        };
      }
      return configurationStatus;
    },
    async persistConfiguration(): Promise<void> {
      try {
        const toSave = buildPersistedConfiguration();
        await configurationStore.save(toSave);
        configurationStatus = {
          ...configurationStatus,
          loaded: true,
          schemaVersion: toSave.schemaVersion,
          source: "active",
          lastSave: toSave.savedAt,
          persistenceHealthy: true,
          lastPersistenceErrorCode: null
        };
      } catch (e) {
        const code = e instanceof Error ? "configuration_write_failed" : "configuration_write_failed";
        configurationStatus = {
          ...configurationStatus,
          persistenceHealthy: false,
          lastPersistenceErrorCode: code
        };
        throw new ProtocolError("configuration_write_failed", "Failed to save configuration.", false);
      }
    },
    async exportConfiguration(): Promise<ExportedAssistantConfiguration> {
      return configurationStore.exportSanitized();
    },
    async importConfiguration(input: unknown): Promise<void> {
      try {
        const imported = await configurationStore.importConfiguration(input);
        applyPersistedConfiguration(imported);
        configurationStatus = {
          loaded: true,
          schemaVersion: imported.schemaVersion,
          source: "active",
          lastSave: imported.savedAt,
          persistenceHealthy: true,
          lastPersistenceErrorCode: null,
          warning: null
        };
      } catch (e) {
        configurationStatus = {
          ...configurationStatus,
          persistenceHealthy: false,
          lastPersistenceErrorCode: "configuration_import_rejected"
        };
        const message = e instanceof Error ? e.message : "Import rejected.";
        throw new ProtocolError("configuration_import_rejected", message, false);
      }
    },
    async resetConfiguration(): Promise<void> {
      await configurationStore.reset();
      assistantProfileService.reset();
      toolPolicies = new Map([
        [
          "format_technician_note",
          {
            organizationId: identity.organizationId ?? "dev",
            toolId: "format_technician_note",
            enabled: true,
            allowedRoles: ["workstation_agent", "ai_host", "combined"],
            requiresConfirmation: false,
            executionLocation: "local"
          }
        ],
        [
          "draft_customer_update",
          {
            organizationId: identity.organizationId ?? "dev",
            toolId: "draft_customer_update",
            enabled: true,
            allowedRoles: ["workstation_agent", "ai_host", "combined"],
            requiresConfirmation: true,
            executionLocation: "local"
          }
        ]
      ]);
      enabledTools = Array.from(DEFAULT_ENABLED_TOOLS);
      config = normalizeConfig(DEFAULT_CONFIG);
      providerSelection = config.providerSelection;
      ollamaProvider = new OllamaProvider({ endpoint: config.ollamaEndpoint });
      rebuild();
      configurationStatus = buildDefaultConfigurationStatus();
    },
    getConfigurationStatus(): ConfigurationStatus { return configurationStatus; }
  };
}

function selectProvider(sel: ProviderSelection, ollama: AIProvider, mock: AIProvider): AIProvider {
  if (sel === "ollama") return ollama;
  if (sel === "mock") return mock;
  return ollama;
}

export { isProcessingCapable, ProtocolError, randomUUID };
