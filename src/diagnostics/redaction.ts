const REDACTED = "[redacted]";

const SENSITIVE_KEYS = new Set<string>([
  "token",
  "password",
  "secret",
  "credential",
  "credentialToken",
  "authorization",
  "technicianNote",
  "technician_note",
  "formattedNote",
  "formatted_note",
  "customerReportedIssue",
  "customer_reported_issue",
  "systemPrompt",
  "system_prompt",
  "userPrompt",
  "user_prompt",
  "rawContent",
  "raw_content",
  "apiKey",
  "api_key"
]);

export function redactString(value: string): string {
  return value.length > 0 ? REDACTED : value;
}

export function redactObject<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redactObject(v)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redactObject(v);
      }
    }
    return out as unknown as T;
  }
  return value;
}

export function isSafeDiagnosticKey(key: string): boolean {
  return !SENSITIVE_KEYS.has(key);
}

export const SAFE_DIAGNOSTIC_KEYS = [
  "helperId",
  "helperRole",
  "pairingState",
  "executionTarget",
  "ollamaEndpointHost",
  "providerHealth",
  "modelAvailability",
  "jobId",
  "taskName",
  "requestDurationMs",
  "payloadByteCount",
  "errorCode",
  "appVersion",
  "runtimeMode",
  "helperState",
  "credentialStatus",
  "lastHeartbeat",
  "activeJobId",
  "activeJobState",
  "pendingSubmissions",
  "claimLoopRunning",
  "protocolVersion"
] as const;
