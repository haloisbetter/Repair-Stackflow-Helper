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
  const taskRegistry = new TaskRegistry(
    new Map([["format_technician_note", formatTechnicianNoteTemplate]])
  );
  let jobRunner = new JobRunner({ identity, config, provider, taskRegistry, store });
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
    jobRunner = new JobRunner({ identity, config, provider, taskRegistry, store });
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
    getStore(): TemporaryJobStore { return store; }
  };
}

function selectProvider(sel: ProviderSelection, ollama: AIProvider, mock: AIProvider): AIProvider {
  if (sel === "ollama") return ollama;
  if (sel === "mock") return mock;
  // auto: prefer ollama; tests/dev can explicitly choose mock.
  return ollama;
}

export { isProcessingCapable, ProtocolError, randomUUID };
