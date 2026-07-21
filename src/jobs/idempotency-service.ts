import { createHash } from "node:crypto";
import { SCHEMA_VERSION } from "../contracts/v1/common.js";

export function computeIdempotencyKey(parts: {
  schemaVersion: string;
  jobId: string;
  requestId: string;
  task: string;
}): string {
  const raw = `${parts.schemaVersion}|${parts.jobId}|${parts.requestId}|${parts.task}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 64);
}

export function ensureV1(schemaVersion: string): void {
  if (schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported schemaVersion: ${schemaVersion}`);
  }
}
