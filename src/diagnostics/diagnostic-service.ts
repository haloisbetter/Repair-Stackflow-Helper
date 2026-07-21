import { redactObject } from "./redaction.js";
import type { HelperIdentity } from "../contracts/v1/pairing.js";
import type { HelperConfig } from "../config/helper-config.js";
import type { HelperHealth } from "../helper/health-service.js";
import type { TemporaryJobStore } from "../jobs/temporary-job-store.js";

export interface DiagnosticSnapshot {
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
}

export class DiagnosticService {
  constructor(
    private readonly getIdentity: () => HelperIdentity,
    private readonly getConfig: () => HelperConfig,
    private readonly getHealth: () => HelperHealth | null,
    private readonly getStore: () => TemporaryJobStore
  ) {}

  snapshot(): DiagnosticSnapshot {
    const identity = this.getIdentity();
    const config = this.getConfig();
    const health = this.getHealth();
    const store = this.getStore();
    const active = store.getActiveJob();
    const lastError = store.getLastSanitizedError();
    let host = "unknown";
    try {
      host = new URL(config.ollamaEndpoint).host;
    } catch {
      host = "unknown";
    }
    return {
      helperId: identity.helperId,
      helperRole: identity.role,
      pairingState: identity.pairingState,
      executionTarget: config.executionTarget,
      ollamaEndpointHost: host,
      providerHealth: health?.state ?? "unknown",
      modelAvailability: health?.modelAvailable ?? false,
      activeJobId: active?.jobId ?? null,
      taskName: active?.task ?? null,
      requestDurationMs: null,
      payloadByteCount: null,
      errorCode: lastError?.code ?? null,
      appVersion: identity.appVersion,
      generatedAt: new Date().toISOString()
    };
  }

  sanitize<T>(value: T): T {
    return redactObject(value);
  }
}
