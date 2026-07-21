import { randomUUID } from "node:crypto";
import type { AIProvider, AIExecutionResult, ApprovedAIExecutionRequest } from "./ai-provider.js";
import type { ModelAvailability, ProviderHealth, ProviderHealthStatus } from "./provider-health.js";

interface OllamaProviderOptions {
  endpoint: string;
  fetchImpl?: typeof fetch;
}

export class OllamaProvider implements AIProvider {
  readonly name = "ollama" as const;
  private readonly fetchImpl: typeof fetch;
  private readonly endpoint: string;

  constructor(opts: OllamaProviderOptions) {
    this.endpoint = opts.endpoint.replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await this.fetchImpl(`${this.endpoint}/api/tags`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3_000)
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return this.unhealthy("misconfigured", `HTTP ${res.status}`, latencyMs);
      }
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const models = (data.models ?? []).map((m) => m.name);
      return {
        status: "available",
        endpoint: this.endpoint,
        latencyMs,
        models,
        checkedAt: new Date().toISOString()
      };
    } catch (e) {
      const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
      const status: ProviderHealthStatus = isTimeout ? "timed_out" : "unavailable";
      return this.unhealthy(status, e instanceof Error ? e.message : String(e), Date.now() - start);
    }
  }

  async checkModel(model: string): Promise<ModelAvailability> {
    const health = await this.healthCheck();
    if (health.status !== "available") return { available: false, model };
    const exact = health.models.includes(model);
    const tagged = health.models.some((m) => m === model || m.startsWith(`${model}:`));
    return { available: exact || tagged, model };
  }

  async execute(request: ApprovedAIExecutionRequest): Promise<AIExecutionResult> {
    const start = Date.now();
    const res = await this.fetchImpl(`${this.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model: request.model,
        stream: false,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt }
        ],
        options: { temperature: 0 }
      }),
      signal: AbortSignal.timeout(request.timeoutMs)
    });
    const durationMs = Date.now() - start;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { message?: { content?: string }; error?: string };
    if (data.error) throw new Error(`Ollama error: ${data.error}`);
    const content = data.message?.content ?? "";
    if (!content) throw new Error("Ollama returned empty content");
    if (content.length > request.maxResponseBytes) {
      throw new Error(`Ollama response exceeded maxResponseBytes (${content.length} > ${request.maxResponseBytes})`);
    }
    return {
      rawContent: content,
      provider: "ollama",
      model: request.model,
      durationMs
    };
  }

  private unhealthy(status: ProviderHealthStatus, detail: string, latencyMs: number): ProviderHealth {
    return {
      status,
      endpoint: this.endpoint,
      latencyMs,
      models: [],
      checkedAt: new Date().toISOString(),
      detail
    };
  }
}

// Exported for tests/dev: a deterministic mock that does not call the network.
export function makeOllamaProvider(endpoint: string, fetchImpl?: typeof fetch): OllamaProvider {
  const opts: OllamaProviderOptions = { endpoint };
  if (fetchImpl) opts.fetchImpl = fetchImpl;
  return new OllamaProvider(opts);
}

// Internal helper to fabricate a request id when none is provided.
export function ensureRequestId(id?: string): string {
  return id ?? randomUUID();
}
