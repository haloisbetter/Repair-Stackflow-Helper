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
import { TemporaryJobStore } from "./jobs/temporary-job-store.js";
import { JobRunner } from "./jobs/job-runner.js";
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

export interface HelperContext {
  config: HelperConfig;
  identity: HelperIdentity;
  state: StateMachine;
  pairing: PairingService;
  provider: AIProvider;
  healthService: HealthService;
  taskRegistry: TaskRegistry;
  store: TemporaryJobStore;
  jobRunner: JobRunner;
  diagnostics: DiagnosticService;
  assistantProfileService: AssistantProfileService;
  toolRegistry: ToolRegistry;
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
}

export function createHelperContext(initialConfig: Partial<HelperConfig> = {}): HelperContext {
  let config = normalizeConfig({ ...DEFAULT_CONFIG, ...initialConfig });
  const state = new StateMachine();
  let identity = createDevelopmentIdentity(config.helperRole);
  const pairing = createDevPairingService();
  const store = new TemporaryJobStore();

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
    ]
  ]);
  let enabledTools: readonly string[] = Array.from(DEFAULT_ENABLED_TOOLS);
  const taskRegistry = new TaskRegistry(
    new Map([["format_technician_note", formatTechnicianNoteTemplate]]),
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
    assistantProfileService
  });
  let diagnostics = new DiagnosticService(
    () => identity,
    () => config,
    () => lastHealth,
    () => store
  );
  let lastHealth: HelperHealth | null = null;
  let lastPairing: PairingResult | null = null;

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
      assistantProfileService
    });
  }

  return {
    get config() { return config; },
    get identity() { return identity; },
    get state() { return state; },
    get pairing() { return pairing; },
    get provider() { return provider; },
    get healthService() { return healthService; },
    get taskRegistry() { return taskRegistry; },
    get store() { return store; },
    get jobRunner() { return jobRunner; },
    get diagnostics() { return diagnostics; },
    get assistantProfileService() { return assistantProfileService; },
    get toolRegistry() { return tools; },
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
    }
  };
}

function selectProvider(sel: ProviderSelection, ollama: AIProvider, mock: AIProvider): AIProvider {
  if (sel === "ollama") return ollama;
  if (sel === "mock") return mock;
  // auto: prefer ollama; tests/dev can explicitly choose mock.
  return ollama;
}

export { isProcessingCapable, ProtocolError, randomUUID };
