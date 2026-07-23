import { z } from "zod";
import type { TranscriptSegment } from "../checkin/checkin-contract.js";

export const TranscriptionProviderHealthStatus = z.enum([
  "available",
  "unavailable",
  "misconfigured",
  "timed_out"
]);
export type TranscriptionProviderHealthStatus = z.infer<typeof TranscriptionProviderHealthStatus>;

export const TranscriptionProviderHealth = z.object({
  status: TranscriptionProviderHealthStatus,
  providerName: z.string().min(1).max(64),
  endpoint: z.string().min(1).max(256),
  detail: z.string().optional(),
  isLocal: z.boolean(),
  isCloud: z.boolean()
}).strict();
export type TranscriptionProviderHealth = z.infer<typeof TranscriptionProviderHealth>;

export interface TranscribeChunkInput {
  audioChunk: ArrayBuffer;
  sessionStartTimeMs: number;
  speakerRole?: "customer" | "employee" | "unknown";
}

export interface TranscribeChunkResult {
  segments: TranscriptSegment[];
  providerName: string;
}

export interface FinalizeSessionInput {
  sessionId: string;
}

export interface FinalizeSessionResult {
  segments: TranscriptSegment[];
  providerName: string;
}

export interface TranscriptionProvider {
  readonly name: string;
  readonly isLocal: boolean;
  readonly isCloud: boolean;
  getHealth(): Promise<TranscriptionProviderHealth>;
  transcribeChunk(input: TranscribeChunkInput): Promise<TranscribeChunkResult>;
  finalizeSession(input: FinalizeSessionInput): Promise<FinalizeSessionResult>;
}
