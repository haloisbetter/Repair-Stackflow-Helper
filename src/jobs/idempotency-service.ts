import { createHash } from "node:crypto";
import { SCHEMA_VERSION } from "../contracts/v1/common.js";

/**
 * In production mode, the backend issues a stable `submissionKey` with each
 * ClaimedJob. That key MUST be used for result/failure submissions — it is
 * the authoritative idempotency token the backend recognizes.
 *
 * In development mode (local conversation route), the Helper generates its own
 * key from the job's canonical identifiers. This is safe because dev mode never
 * submits results to a real backend.
 */
export function computeIdempotencyKey(parts: {
  schemaVersion: string;
  jobId: string;
  requestId: string;
  task: string;
}): string {
  const raw = `${parts.schemaVersion}|${parts.jobId}|${parts.requestId}|${parts.task}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 64);
}

export function resolveSubmissionKey(backendIssuedKey: string | null | undefined, localParts: {
  schemaVersion: string;
  jobId: string;
  requestId: string;
  task: string;
}): string {
  if (backendIssuedKey && backendIssuedKey.length >= 16) return backendIssuedKey;
  return computeIdempotencyKey(localParts);
}

export function ensureV1(schemaVersion: string): void {
  if (schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported schemaVersion: ${schemaVersion}`);
  }
}
