# Production Runtime Architecture

This document describes the production runtime foundation added in Master Prompt 2. It transforms the Repair StackFlow Helper from a local development prototype into a production-capable execution client.

## Overview

The production runtime enables the Helper to:

1. **Pair** with a Repair StackFlow backend using a one-time pairing code
2. **Authenticate** using stored credentials (device credential)
3. **Send heartbeats** to report capabilities and health
4. **Claim jobs** from the backend's approved queue
5. **Execute jobs** locally through the existing JobRunner
6. **Submit results** back to the backend with full provenance
7. **Retry failed submissions** through a durable pending-submission store

## Dual-Mode Architecture

The Helper runs in one of two modes:

| Aspect | Development | Production |
|--------|-------------|------------|
| Backend client | `DevelopmentBackendClient` (in-memory) | `ProductionBackendClient` (HTTPS) |
| Credential store | `InMemoryCredentialStore` | `FileCredentialStore` (mode 0o600) |
| Pending submissions | `InMemoryPendingSubmissionStore` | `FilePendingSubmissionStore` |
| Pairing codes | DEV-YORKTOWN, DEV-HAMPTON | Backend-issued codes |
| Claim loop | Disabled (returns no jobs) | Active with exponential backoff |
| HTTPS enforcement | Not required | Required |

Both modes share the same `BackendClient` interface and protocol contracts.

## State Machines

### Helper State Machine (12 states)

```
unconfigured → unpaired → pairing → paired → connecting → ready ⇆ degraded ⇆ offline
                                                          ↓
                                              credential_expired / credential_revoked / incompatible / error
```

- **unconfigured**: Initial state, no configuration loaded
- **unpaired**: No valid credential present
- **pairing**: Actively exchanging a pairing code
- **paired**: Credential stored, not yet connected
- **connecting**: Establishing backend connectivity
- **ready**: Fully operational, heartbeats succeeding
- **degraded**: Operational but with issues (e.g., 3 consecutive heartbeat failures)
- **offline**: No backend connectivity
- **credential_expired**: Credential past its expiry date
- **credential_revoked**: Backend rejected the credential (HTTP 401)
- **incompatible**: Protocol version mismatch (HTTP 426)
- **error**: Unrecoverable error state

### Job Lifecycle State Machine (11 states)

```
queued → claimed → leased → running → validating → submitting → completed
                                                              → failed
                                                              → dead_letter
```

Each job has its own `JobStateMachine` instance. Terminal states: `completed`, `failed`, `cancelled`, `expired`, `dead_letter`.

## Backend Client Interface

The `BackendClient` interface defines 10 methods:

- `exchangePairingCode()` — one-time pairing
- `revokeCredential()` — unpair
- `sendHeartbeat()` — periodic capability/health report
- `reportCapabilities()` — full capability snapshot
- `claimJob()` — poll for available jobs
- `renewLease()` — extend job lease before expiry
- `reportJobStatus()` — in-progress status updates
- `submitResult()` — successful completion with output
- `submitFailure()` — structured failure report
- `acknowledgeCancellation()` — accept backend cancellation

## Credential Store

The credential is stored separately from ordinary configuration:

- **FileCredentialStore**: Writes to `~/.repair-stackflow-helper/.credential` with `mode 0o600`
- **InMemoryCredentialStore**: For development and testing
- **Future**: macOS Keychain integration via `SecItemAdd`/`SecItemCopyMatching`

The credential is **never** exposed in:
- The `/api/v1/runtime/status` response
- Diagnostic snapshots
- Log output
- Configuration exports

## Heartbeat Service

Periodic heartbeats report:
- Helper identity (helperId, organization, location)
- Runtime mode and protocol version
- Active AI provider status (provider, model availability, latency)
- Implemented and enabled tasks
- Active job state
- Pending submission count

After **3 consecutive failures**, the heartbeat service transitions the Helper to `degraded` state.

## Claim Loop

The claim loop polls the backend for available jobs:

1. Check that Helper is in a processing-capable state (ready or degraded)
2. Process any pending submissions first
3. Send a `JobClaimRequest` with current capabilities
4. If a job is claimed, validate it:
   - `assignedHelperId` matches this Helper
   - `organizationId` matches
   - `locationId` matches
   - Job has not expired
   - Task is implemented and enabled
5. Execute through the existing `JobRunner`
6. Submit result or failure to the backend
7. If submission fails, enqueue in the pending-submission store

### Backoff Strategy

- Normal polling interval: 10 seconds (configurable)
- After claim failures: exponential backoff from 2s base, max 60s
- Lease renewal: scheduled at `leasedUntil - 30s` margin

## Pending Submission Store

Results that complete locally but fail to submit are durably stored:

- Maximum 32 items
- Pending items expire after 24 hours
- Dead-letter items retained for 48 hours for debugging
- Deduplication by `submissionKey`
- Retry with exponential backoff (2s base, max 60s)
- Dead-lettered after configured max attempts (default: 5)

## Idempotency

In production mode, the backend issues a stable `submissionKey` with each `ClaimedJob`. This key is used for:
- Result submissions
- Failure submissions
- Pending-submission deduplication

In development mode, keys are computed locally from `schemaVersion|jobId|requestId|task`.

## Protocol Contracts

All backend communication uses strict Zod schemas (protocol version "1.0"):

- `PairingRequest` / `PairingResponse`
- `HeartbeatRequest` / `BackendAcknowledgment`
- `CapabilityReport`
- `JobClaimRequest` / `JobClaimResponse` (discriminated union)
- `ClaimedJob` (with leaseId, submissionKey, attemptNumber)
- `LeaseRenewalRequest` / `LeaseRenewalResponse`
- `JobStatusUpdate`
- `ResultSubmission` / `SubmissionAcknowledgment`
- `FailureSubmission` (18 failure categories)
- `CancellationAcknowledgment`
- `ProtocolCompatibilityError`

## Runtime Coordinator

The `RuntimeCoordinator` orchestrates all production runtime services:

- **start()**: Loads credential, determines initial state, sends initial heartbeat, starts heartbeat timer, starts claim loop (production only)
- **stop()**: Halts heartbeat and claim loop
- **pair(code)**: Exchanges pairing code, stores credential, transitions to ready
- **unpair()**: Revokes credential, clears storage, transitions to unpaired
- **getStatus()**: Returns sanitized `RuntimeStatus` (no credential tokens)

## Routes

Three runtime routes are registered when a coordinator is present:

- `GET /api/v1/runtime/status` — Current runtime status
- `POST /api/v1/runtime/pair` — Pair with a pairing code
- `POST /api/v1/runtime/unpair` — Unpair and clear credential

## Security

- Production HTTPS is enforced in `ProductionBackendClient` constructor
- Credentials use Bearer authentication headers
- Credential files use restrictive permissions (mode 0o600)
- Credential tokens are excluded from all API responses and diagnostics
- Heartbeat payloads contain no customer/note content
- Error messages in failure submissions are sanitized (max 512 chars)
- The `redactObject()` function strips sensitive keys from any diagnostic output

### Security Limitations (TypeScript Prototype)

- File-based credential storage is NOT equivalent to macOS Keychain
- No at-rest encryption for pending submissions
- In-memory credential store for development offers no persistence guarantees
- The prototype does not implement certificate pinning

## Configuration

Runtime preferences in `RuntimePreferences`:

| Field | Default | Description |
|-------|---------|-------------|
| runtimeMode | "development" | "development" or "production" |
| backendBaseUrl | "http://127.0.0.1:8787" | Backend API base URL |
| pollingIntervalMs | 10000 | Claim loop polling interval |
| heartbeatIntervalMs | 30000 | Heartbeat send interval |
| backendTimeoutMs | 15000 | HTTP request timeout |
| maxRetryAttempts | 5 | Max pending submission retries |

## Cancellation

The claim loop handles cancellation through lease renewal:

1. When renewing a lease, the backend may respond with `cancelled: true`
2. The job state machine transitions to `cancelled`
3. The active job is released

The `CancellationAcknowledgment` schema allows the Helper to confirm receipt of a cancellation directive.
