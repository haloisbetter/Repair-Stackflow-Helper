export interface Identity {
  helperName: string;
  role: string;
  pairingState: string;
  organizationId: string | null;
  locationId: string | null;
  appVersion: string;
}

export interface ConfigSummary {
  executionTarget: string;
  providerSelection: string;
  ollamaEndpoint: string;
  approvedModel: string;
  mockProviderEnabled: boolean;
}

export interface HealthSummary {
  state: "ready" | "degraded" | "unavailable" | string;
  provider: "ollama" | "mock";
  ollamaReachable: boolean;
  modelAvailable: boolean;
  latencyMs: number | null;
}

export interface AssistantProfile {
  name: string;
  subtitle: string;
  welcomeMessage: string;
  avatar: { type: "initials"; value: string };
  appearance: { accentColor: string };
  profileVersion: number;
}

export interface InstructionProfile {
  globalInstructions: string;
  toneRules: string[];
  formattingRules: string[];
  prohibitedClaims: string[];
  escalationRules: string[];
  profileVersion: number;
}

export interface RuntimeAssistantConfiguration {
  assistant: AssistantProfile;
  instructions: InstructionProfile;
  enabledTools: string[];
  modelRole: "drafting" | "extraction" | "reasoning" | "fast";
  organizationId?: string;
  compiledAt: string;
}

export interface ToolDefinition {
  toolId: string;
  displayName: string;
  description: string;
  category: string;
  executionLocation: "local" | "repair_stackflow" | "hybrid";
  riskLevel: "low" | "medium" | "high";
  implemented: boolean;
}

export interface ToolPolicy {
  organizationId: string;
  toolId: string;
  enabled: boolean;
  allowedRoles: string[];
  requiresConfirmation: boolean;
  executionLocation: "local" | "repair_stackflow" | "hybrid";
}

export interface ToolWithPolicy extends ToolDefinition {
  policy: ToolPolicy | null;
}

export interface AuthorizationDecision {
  authorized: boolean;
  errorCode?: string;
  reason?: string;
}

export interface ConfigurationStatus {
  loaded: boolean;
  schemaVersion: string | null;
  source: "active" | "backup" | "defaults";
  lastSave: string | null;
  persistenceHealthy: boolean;
  lastPersistenceErrorCode: string | null;
  warning: string | null;
}

export interface ExportedConfiguration {
  schemaVersion: string;
  savedAt: string;
  assistantProfile: AssistantProfile;
  instructionProfile: InstructionProfile;
  toolPolicies: ToolPolicy[];
  runtimePreferences: {
    provider: string;
    executionTarget: string;
    modelRole: string;
    ollamaEndpoint: string;
  };
}

export interface BootstrapResponse {
  identity: Identity;
  config: ConfigSummary;
  health: HealthSummary | null;
  assistant: AssistantProfile;
  runtimeConfig: RuntimeAssistantConfiguration;
  enabledTools: string[];
  configuration: ConfigurationStatus;
  lastPairing: { organizationId: string; locationName: string } | null;
}

export interface TestAiResponse {
  ollamaReachable: boolean;
  modelAvailable: boolean;
  latencyMs: number | null;
  status: string;
  detail: string | null;
  approvedModel: string;
  currentProvider: string;
}

export interface TechnicianNoteResult {
  formattedNote: string;
  customerReportedIssue: string;
  technicianFindings: string[];
  recommendedNextStep: string;
  warnings: string[];
}

export interface JobResult {
  schemaVersion: string;
  jobId: string;
  requestId: string;
  helperId: string;
  task: string;
  status: string;
  idempotencyKey: string;
  provider: "ollama" | "mock";
  executionTarget: string;
  model: string;
  result: TechnicianNoteResult;
  timing: { startedAt: string; completedAt: string; durationMs: number };
}

export interface FormatNoteResponse {
  status: "completed" | "failed";
  result?: JobResult;
  failure?: { errorCode: string; retriable: boolean };
  duplicate?: boolean;
}

export interface RuntimeStatus {
  mode: "development" | "production";
  helperState: string;
  credentialPresent: boolean;
  credentialStatus: "valid" | "expired" | "revoked" | "absent";
  lastHeartbeat: string | null;
  activeJobId: string | null;
  activeJobState: string | null;
  pendingSubmissions: number;
  claimLoopRunning: boolean;
  protocolVersion: string;
}

export interface DeveloperStatus {
  runtime: {
    appVersion: string;
    environment: string;
    host: string;
    port: number;
    platform: string;
    architecture: string;
    uptimeMs: number;
  };
  identity: {
    helperId: string;
    helperName: string;
    role: string;
    pairingState: string;
    organizationId: string | null;
    locationId: string | null;
  };
  aiRuntime: {
    executionTarget: string;
    selectedProvider: string;
    ollamaEndpoint: string;
    approvedModel: string;
    endpointStatus: string;
    modelStatus: string;
    lastHealthCheck: string | null;
    responseLatencyMs: number | null;
  };
  jobs: {
    activeJobId: string | null;
    lastCompletedJobId: string | null;
    lastTask: string | null;
    temporaryResultCount: number;
    failureCount: number;
    lastErrorCode: string | null;
  };
  diagnostics: {
    helperId: string;
    helperRole: string;
    pairingState: string;
    executionTarget: string;
    ollamaEndpointHost: string;
    providerHealth: string;
    modelAvailability: boolean;
    activeJobId: string | null;
    taskName: string | null;
    requestDurationMs: number | null;
    payloadByteCount: number | null;
    errorCode: string | null;
    appVersion: string;
    generatedAt: string;
    configurationLoaded: boolean;
    configurationSchemaVersion: string | null;
    configurationSource: string;
    lastConfigurationSave: string | null;
    persistenceHealthy: boolean;
    lastPersistenceErrorCode: string | null;
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = typeof data === "string" ? data : JSON.stringify(data);
    throw new ApiError(`HTTP ${res.status}: ${msg}`, res.status, data);
  }
  return data as T;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export const api = {
  bootstrap: () => request<BootstrapResponse>("/api/v1/conversation/bootstrap"),
  status: () => request<BootstrapResponse>("/api/v1/status"),
  formatNote: (technicianNote: string) =>
    request<FormatNoteResponse>("/api/v1/actions/format-technician-note", {
      method: "POST",
      body: JSON.stringify({ technicianNote, outputStyle: "professional_repair_note" })
    }),
  testAi: () =>
    request<TestAiResponse>("/api/v1/actions/test-ai", { method: "POST" }),
  clear: () => request<{ cleared: boolean }>("/api/v1/actions/clear", { method: "POST" }),
  developerStatus: () => request<DeveloperStatus>("/api/v1/developer/status"),
  developerReset: () => request<{ reset: boolean }>("/api/v1/developer/reset", { method: "POST" }),
  pair: (code: string) =>
    request<{ paired: boolean; organizationId: string; locationName: string }>("/api/v1/dev/pair", {
      method: "POST",
      body: JSON.stringify({ pairingCode: code })
    }),
  unpair: () => request<{ unpaired: boolean }>("/api/v1/dev/unpair", { method: "POST" }),
  selectProvider: (provider: string) =>
    request<{ selected: string }>("/api/v1/dev/provider/select", {
      method: "POST",
      body: JSON.stringify({ provider })
    }),
  updateConfig: (config: Record<string, unknown>) =>
    request<{ updated: boolean }>("/api/v1/dev/config", {
      method: "POST",
      body: JSON.stringify(config)
    }),
  diagnostics: () => request<unknown>("/api/v1/diagnostics"),
  getAssistantProfile: () => request<AssistantProfile>("/api/v1/assistant/profile"),
  updateAssistantProfile: (profile: AssistantProfile) =>
    request<AssistantProfile>("/api/v1/assistant/profile", {
      method: "PUT",
      body: JSON.stringify(profile)
    }),
  getInstructionProfile: () => request<InstructionProfile>("/api/v1/assistant/instructions"),
  updateInstructionProfile: (profile: InstructionProfile) =>
    request<InstructionProfile>("/api/v1/assistant/instructions", {
      method: "PUT",
      body: JSON.stringify(profile)
    }),
  resetAssistantProfile: () =>
    request<{ reset: boolean }>("/api/v1/assistant/reset", { method: "POST" }),
  getRuntimeConfig: () => request<RuntimeAssistantConfiguration>("/api/v1/assistant/runtime"),
  listTools: () => request<{ tools: ToolWithPolicy[] }>("/api/v1/tools"),
  updateToolPolicy: (toolId: string, policy: Partial<ToolPolicy>) =>
    request<ToolPolicy>(`/api/v1/tools/${encodeURIComponent(toolId)}/policy`, {
      method: "PUT",
      body: JSON.stringify(policy)
    }),
  authorizeTool: (toolId: string, confirmationProvided: boolean) =>
    request<AuthorizationDecision>(`/api/v1/tools/${encodeURIComponent(toolId)}/authorize`, {
      method: "POST",
      body: JSON.stringify({ confirmationProvided })
    }),
  exportConfiguration: () =>
    request<ExportedConfiguration>("/api/v1/dev/configuration/export"),
  importConfiguration: (config: ExportedConfiguration) =>
    request<{ imported: boolean }>("/api/v1/dev/configuration/import", {
      method: "POST",
      body: JSON.stringify(config)
    }),
  resetConfiguration: () =>
    request<{ reset: boolean }>("/api/v1/dev/configuration/reset", { method: "POST" }),
  getConfigurationStatus: () =>
    request<ConfigurationStatus>("/api/v1/dev/configuration/status"),
  runtimeStatus: () => request<RuntimeStatus>("/api/v1/runtime/status"),
  runtimePair: (code: string) =>
    request<{ paired: boolean; organizationId: string | null; locationId: string | null; role: string | null }>("/api/v1/runtime/pair", {
      method: "POST",
      body: JSON.stringify({ pairingCode: code })
    }),
  runtimeUnpair: () => request<{ unpaired: boolean }>("/api/v1/runtime/unpair", { method: "POST" })
};
