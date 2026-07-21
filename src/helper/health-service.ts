import type { HelperConfig } from "../config/helper-config.js";
import type { AIProvider } from "../ai/ai-provider.js";
import type { ProviderHealth } from "../ai/provider-health.js";

export interface HelperHealth {
  state: "ready" | "degraded" | "unavailable";
  executionTarget: HelperConfig["executionTarget"];
  ollamaEndpoint: string;
  approvedModel: string;
  provider: "ollama" | "mock";
  ollamaReachable: boolean;
  modelAvailable: boolean;
  latencyMs: number | null;
  checkedAt: string;
}

export class HealthService {
  constructor(
    private readonly config: HelperConfig,
    private readonly provider: AIProvider
  ) {}

  async check(): Promise<HelperHealth> {
    const health = await this.provider.healthCheck();
    const model = await this.provider.checkModel(this.config.approvedModel);
    const state: HelperHealth["state"] =
      health.status === "available" && model.available ? "ready" : health.status === "timed_out" || health.status === "misconfigured" ? "degraded" : "unavailable";
    return {
      state,
      executionTarget: this.config.executionTarget,
      ollamaEndpoint: this.config.ollamaEndpoint,
      approvedModel: this.config.approvedModel,
      provider: this.provider.name,
      ollamaReachable: health.status === "available",
      modelAvailable: model.available,
      latencyMs: health.latencyMs,
      checkedAt: new Date().toISOString()
    };
  }

  async quickCheck(): Promise<ProviderHealth> {
    return this.provider.healthCheck();
  }
}
