# Protocol v1 — Repair StackFlow Helper

## Schema Version

All v1 payloads use `schemaVersion: "1.0"`. Unsupported versions are rejected with `schema_version_unsupported`.

## Helper Identity

```json
{
  "helperId": "uuid",
  "helperName": "string",
  "role": "workstation_agent | ai_host | combined",
  "pairingState": "unpaired | pairing | paired_disconnected | paired_ready | processing | degraded | error",
  "organizationId": "string",
  "locationId": "string",
  "appVersion": "string",
  "platform": "string",
  "architecture": "string"
}
```

## Approved Tasks

| Task | Status in MVP |
|---|---|
| `format_technician_note` | Enabled |
| `health_check` | Reserved — returns `task_not_enabled` |
| `draft_customer_update` | Reserved — returns `task_not_enabled` |

A job may never supply: `systemPrompt`, `model`, `ollamaUrl`, `shell`, `filePath`, `tools`, `toolCalls`, or `code`. Any such field is rejected with `arbitrary_prompt_rejected`.

## Job Request

```json
{
  "schemaVersion": "1.0",
  "jobId": "uuid",
  "requestId": "uuid",
  "task": "format_technician_note",
  "organizationId": "computer-concepts-dev",
  "locationId": "yorktown-dev",
  "assignedHelperId": "uuid",
  "createdAt": "ISO-8601",
  "expiresAt": "ISO-8601",
  "input": {
    "technicianNote": "string (1..4096)",
    "outputStyle": "professional_repair_note"
  }
}
```

Validation enforces: schema version, UUIDs, approved task, organization match, location match, Helper assignment, creation time, expiration, technician-note length (1..4096), approved output style, and payload-size limit.

## Structured Output (format_technician_note)

```json
{
  "formattedNote": "string (1..4096)",
  "customerReportedIssue": "string (1..1024)",
  "technicianFindings": ["string (1..1024)"],
  "recommendedNextStep": "string (1..1024)",
  "warnings": ["string (1..1024)"]
}
```

- `technicianFindings` may only include findings explicitly present in the original note.
- `recommendedNextStep` may recommend diagnostics but must not claim a diagnosis was completed.
- Unexpected fields are rejected with `unexpected_output_field`.
- Malformed JSON is rejected with `malformed_ai_output`.

## Result

```json
{
  "schemaVersion": "1.0",
  "jobId": "uuid",
  "requestId": "uuid",
  "helperId": "uuid",
  "task": "format_technician_note",
  "status": "completed",
  "idempotencyKey": "sha256(schemaVersion|jobId|requestId|task)[..64]",
  "provider": "ollama | mock",
  "executionTarget": "local_on_this_machine",
  "model": "configured-approved-model",
  "result": { ... },
  "timing": { "startedAt": "ISO-8601", "completedAt": "ISO-8601", "durationMs": "int" }
}
```

Results never include chain-of-thought, raw prompts, full provider conversations, secrets, authorization values, or internal stack traces.

## Idempotency

The idempotency key is `sha256(schemaVersion + jobId + requestId + task)` truncated to 64 hex chars. Running or submitting the same completed job again returns the existing stored result rather than executing the AI task a second time.

## Error Codes

`pairing_code_invalid`, `pairing_code_expired`, `credential_revoked`, `task_not_approved_in_v1`, `task_not_enabled`, `schema_version_unsupported`, `request_too_large`, `request_expired`, `ai_target_unreachable`, `model_unavailable`, `validation_failed`, `malformed_ai_output`, `unexpected_output_field`, `unsupported_output_style`, `submission_failed`, `idempotent_duplicate`, `helper_unpaired`, `helper_assignment_mismatch`, `organization_mismatch`, `location_mismatch`, `job_not_found`, `result_not_found`, `active_job_conflict`, `not_configured`, `arbitrary_prompt_rejected`, `internal_error`.

Retryable: `ai_target_unreachable`, `model_unavailable`. All others are non-retryable in this MVP.

## Payload Limits

- Max request bytes: configurable (default 16,384).
- Max response bytes: configurable (default 16,384).
- Technician note: 1..4096 characters.
- Findings/warnings arrays: max 32 entries each.

## Expiration

Jobs carry `expiresAt`. Expired jobs are rejected with `request_expired` and are not claimed. Temporary completed results expire after 5 minutes in the in-memory store.

## Development Endpoints

```
GET  /api/v1/health
GET  /api/v1/status
POST /api/v1/dev/pair
POST /api/v1/dev/unpair
POST /api/v1/dev/jobs/format-technician-note
GET  /api/v1/dev/jobs/:jobId
POST /api/v1/dev/jobs/:jobId/clear
GET  /api/v1/diagnostics
POST /api/v1/ai/test-connection
POST /api/v1/dev/provider/select
POST /api/v1/dev/config
```

All `/dev/` endpoints are development-only. The server binds to `127.0.0.1` by default.
