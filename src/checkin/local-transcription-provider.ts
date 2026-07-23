import type {
  TranscriptionProvider,
  TranscriptionProviderHealth,
  TranscribeChunkInput,
  TranscribeChunkResult,
  FinalizeSessionInput,
  FinalizeSessionResult
} from "./transcription-provider.js";
import type { TranscriptSegment } from "./checkin-contract.js";

export interface LocalTranscriptionProviderOptions {
  endpoint: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class LocalTranscriptionProvider implements TranscriptionProvider {
  readonly name = "local-transcription";
  readonly isLocal = true;
  readonly isCloud = false;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: LocalTranscriptionProviderOptions) {
    this.endpoint = opts.endpoint.replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async getHealth(): Promise<TranscriptionProviderHealth> {
    try {
      const res = await this.fetchImpl(`${this.endpoint}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(3_000)
      });
      if (!res.ok) {
        return {
          status: "misconfigured",
          providerName: this.name,
          endpoint: this.endpoint,
          detail: `HTTP ${res.status}`,
          isLocal: true,
          isCloud: false
        };
      }
      return {
        status: "available",
        providerName: this.name,
        endpoint: this.endpoint,
        isLocal: true,
        isCloud: false
      };
    } catch (e) {
      const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
      return {
        status: isTimeout ? "timed_out" : "unavailable",
        providerName: this.name,
        endpoint: this.endpoint,
        detail: e instanceof Error ? e.message : String(e),
        isLocal: true,
        isCloud: false
      };
    }
  }

  async transcribeChunk(input: TranscribeChunkInput): Promise<TranscribeChunkResult> {
    const res = await this.fetchImpl(`${this.endpoint}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: input.audioChunk,
      signal: AbortSignal.timeout(this.timeoutMs)
    }).catch((e) => {
      if (e instanceof DOMException && e.name === "TimeoutError") {
        throw new Error(`Local transcription timed out after ${this.timeoutMs}ms`);
      }
      throw new Error(`Local transcription unreachable: ${e instanceof Error ? e.message : String(e)}`);
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Local transcription HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json() as { segments?: TranscriptSegment[] };
    return {
      segments: data.segments ?? [],
      providerName: this.name
    };
  }

  async finalizeSession(_input: FinalizeSessionInput): Promise<FinalizeSessionResult> {
    return { segments: [], providerName: this.name };
  }
}
