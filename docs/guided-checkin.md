# Guided Check-In Workflow

## Overview

The Guided Check-In workflow enables an employee to assist a customer through a structured device intake conversation. Audio capture is **consent-gated** — no microphone activity occurs until the customer explicitly grants consent. The system transcribes the conversation, progressively extracts structured fields, detects missing required fields and conflicts, generates a technician-friendly symptom summary, and supports customer/device matching suggestions — all reviewed by the employee before submission.

This is an **employee-assisted** workflow, not an autonomous kiosk. The employee drives the session, reviews extracted data, corrects inaccuracies, and approves the final check-in proposal.

## Architecture

```
Employee UI (GuidedCheckIn.tsx)
       │
       ▼
Check-in Routes (routes/checkin.ts)
       │
       ├── TemporaryCheckInStore ──── in-memory session storage (bounded)
       ├── TranscriptionProvider ──── mock or local whisper.cpp/MLX adapter
       ├── MockFieldExtractor ─────── deterministic field extraction (dev)
       ├── MissingFieldEngine ─────── required-field detection by device category
       ├── ConflictDetector ───────── duplicate/contradiction detection
       ├── MockSymptomSummarizer ──── concise technician summary (dev)
       └── BackendClient ──────────── customer/device matching + proposal submission
```

## Session Lifecycle

The check-in session follows a strict 13-state state machine:

```
created → awaiting_consent → ready → listening ⇄ paused
                                        │
                                        ▼
                                   processing
                                   ↙    ↓    ↘
                          needs_information  ready_for_review
                                   ↘    ↑    ↙
                                    accept/reject/cancel
                                        │
                              ──────────┴──────────
                              expired / error
```

### States

| State | Description |
|-------|-------------|
| `created` | Session initialized but no consent requested yet |
| `awaiting_consent` | Consent prompt shown to customer |
| `ready` | Consent granted, capture can begin |
| `listening` | Audio capture active, transcript segments being collected |
| `paused` | Capture temporarily halted by employee |
| `processing` | Field extraction or summarization in progress |
| `needs_information` | Required fields missing, employee prompted to collect more |
| `ready_for_review` | All required fields collected, awaiting employee review |
| `accepted` | Employee approved the check-in, proposal submitted |
| `rejected` | Employee rejected the check-in |
| `cancelled` | Session cancelled by employee |
| `expired` | Session exceeded TTL (1 hour) without completion |
| `error` | Unrecoverable error occurred |

### State Transitions

Valid transitions are defined in `VALID_STATE_TRANSITIONS` in `checkin-contract.ts` and enforced by `canTransitionCheckIn()`. Terminal states (`accepted`, `rejected`, `cancelled`, `expired`, `error`) cannot transition further.

## Consent

Consent is a **hard gate** — `canCaptureAudio()` returns `false` unless consent status is `granted`. The consent lifecycle:

- `not_requested` — Initial state, no capture possible
- `granted` — Customer approved audio capture, transitions to `ready`
- `declined` — Customer declined, session moves to manual fallback
- `withdrawn` — Customer revoked consent mid-session, capture stops immediately

When consent is declined or withdrawn, the employee can use manual fallback mode to enter fields directly.

## Audio Capture & Transcription

### TranscriptionProvider Interface

```typescript
interface TranscriptionProvider {
  getHealth(): Promise<TranscriptionProviderHealth>;
  transcribeChunk(audioChunk, sessionId): Promise<TranscriptSegment[]>;
  finalizeSession(sessionId): Promise<TranscriptSegment[]>;
}
```

### Providers

- **MockTranscriptionProvider** — Deterministic mock that returns 10 predefined customer conversation segments. Used in development mode. No actual audio processing.
- **LocalTranscriptionProvider** — HTTP adapter for a local whisper.cpp or MLX transcription service. Configurable endpoint, timeout, and health check. **No audio leaves the device.**

### TranscriptSegment Schema

Each segment contains:
- `segmentId` — Unique identifier
- `text` — Transcribed text
- `startTimeMs` / `endTimeMs` — Timing within the session
- `confidence` — Provider confidence score (0-1)
- `speakerRole` — `customer`, `employee`, or `unknown`
- `provider` — `mock` or `local`
- `isInterim` — Boolean for interim vs. final segments

## Field Extraction

### Extracted Fields

Fields are organized into four groups:

1. **Customer Fields** — name, phone, email, preferred contact method
2. **Device Fields** — brand, model, device category, serial number, color, carrier, OS version
3. **Repair Intake Fields** — reported issue, symptom timeline, liquid exposure, backup status, Find My status, data importance
4. **Operational Fields** — passcode handling, charger received, case included, urgency level

### Field Confidence Levels

Each extracted field carries a confidence level:

- `confirmed` — Employee explicitly verified this value
- `stated` — Customer stated this directly in the transcript
- `inferred` — Derived from context (lower confidence)
- `unknown` — Field not yet collected
- `conflicting` — Multiple conflicting values detected

### Extraction Implementation

Development mode uses `extractFieldsDeterministic()` — a regex-based extractor that identifies names, phone numbers, emails, device details, issue descriptions, and status indicators from transcript text. It:

- Preserves employee-confirmed values (never overwrites)
- Excludes passcodes from extraction (privacy)
- Detects and rejects prompt injection attempts
- Normalizes phone numbers and email addresses

## Missing Field Engine

The `MissingFieldEngine` is deterministic and configurable by device category:

- **16 default required fields** across customer, device, and repair intake groups
- **Apple-specific** — Find My status required for all Apple devices
- **Device-specific** — Carrier required for phones, OS version for computers/tablets
- **Configurable** — `getRequiredFields()` accepts device category and Apple flag

`getMissingFields()` compares extracted fields against required fields and returns missing field names. `getMissingQuestions()` returns suggested questions for the employee to ask.

## Conflict Detection

`ConflictDetector` identifies:

1. **Duplicate values** — Same field extracted with different values
2. **Liquid exposure contradictions** — Customer both confirms and denies liquid exposure
3. **Backup status contradictions** — Conflicting backup status statements
4. **Charger conflicts** — Contradictory charger-received statements

Conflicts have resolution states: `unresolved` or `employee_resolved`. The employee must resolve conflicts before accepting, or explicitly accept with unresolved conflicts (flagged for the technician).

## Symptom Summary

`summarizeSymptomsDeterministic()` generates a concise, technician-friendly summary:

- Pulls from structured extracted fields (not raw transcript)
- Preserves uncertainty markers (e.g., "customer reports", "possibly")
- Flags data concerns (no backup, Find My enabled, liquid exposure)
- **Never invents diagnoses** — only reports what the customer stated
- Includes a list of uncertainties for the technician to verify

## Customer & Device Matching

The `BackendClient` interface provides:

- `searchCustomerMatches()` — Searches existing customer records by name/phone/email
- `searchDeviceMatches()` — Searches existing device records by serial number
- `submitCheckInProposal()` — Submits the approved check-in to the backend

In development mode, matches return mock data labeled with `isMock: true`. In production, these call the backend API. Matches are **suggestions only** — no auto-merge. The employee decides whether to link to an existing record or create a new one.

## Temporary Session Storage

`TemporaryCheckInStore` is an in-memory bounded store:

| Bound | Limit |
|-------|-------|
| Maximum sessions | 16 |
| Maximum transcript segments per session | 500 |
| Maximum transcript bytes per session | 256 KB |
| Session TTL | 1 hour |

Sessions exceeding bounds are evicted (oldest first). Expired sessions are cleaned up on access. Session metrics (`getSessionMetrics()`) expose only counts and timestamps — **no transcript content, customer data, or symptom text**.

## Privacy Controls

- **Consent-gated capture** — No audio activity without explicit consent
- **Passcode exclusion** — Passcodes are never extracted or stored
- **Prompt injection detection** — Injection attempts in transcript are flagged and excluded
- **Local transcription** — Audio processing stays on-device (local provider)
- **Bounded storage** — Sessions auto-expire and are evicted under memory pressure
- **Metrics privacy** — Diagnostic metrics expose no sensitive content
- **Employee review** — All extracted data is reviewed before submission

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/checkin/sessions` | Create a new check-in session |
| GET | `/api/v1/checkin/sessions/:id` | Get session state |
| POST | `/api/v1/checkin/sessions/:id/consent` | Record consent decision |
| POST | `/api/v1/checkin/sessions/:id/capture/start` | Begin audio capture |
| POST | `/api/v1/checkin/sessions/:id/capture/pause` | Pause capture |
| POST | `/api/v1/checkin/sessions/:id/capture/resume` | Resume paused capture |
| POST | `/api/v1/checkin/sessions/:id/capture/stop` | Stop capture |
| POST | `/api/v1/checkin/sessions/:id/transcript/mock` | Add mock transcript (dev) |
| POST | `/api/v1/checkin/sessions/:id/extract` | Run field extraction |
| PUT | `/api/v1/checkin/sessions/:id/fields` | Update fields (employee corrections) |
| POST | `/api/v1/checkin/sessions/:id/summarize` | Generate symptom summary |
| POST | `/api/v1/checkin/sessions/:id/review` | Submit review decision |
| POST | `/api/v1/checkin/sessions/:id/cancel` | Cancel session |
| GET | `/api/v1/checkin/transcription/health` | Transcription provider health |
| GET | `/api/v1/checkin/metrics` | Active session metrics |
| POST | `/api/v1/checkin/matches/customers` | Search customer matches |
| POST | `/api/v1/v1/checkin/matches/devices` | Search device matches |

## UI

The `GuidedCheckIn` React component provides:

- Session creation and status display
- Consent recording (grant/decline/withdraw)
- Capture controls (start/pause/resume/stop) with recording indicator
- Live transcript display with speaker roles
- Extracted fields table with confidence badges
- Conflict display with resolution states
- Missing fields list with suggested questions
- Symptom summary panel with warnings and uncertainties
- Review actions (accept/reject/regenerate summary/copy summary/cancel)
- Manual fallback mode when consent is declined

## Manual Fallback

When consent is declined or withdrawn, the employee can:

1. Continue the session in manual mode
2. Enter fields directly via the fields update endpoint
3. Run extraction on manually-entered text
4. Generate symptom summary and submit review as normal

Manual mode is indicated in the UI and the session state transitions proceed without audio capture.

## Exclusions

The following were explicitly excluded from this workflow:

- Autonomous kiosk mode (employee-assisted only)
- Wake words or hot-word detection
- Background listening
- PIMS automation (no auto-merge, suggestions only)
- Store AI Gateway integration
- Remote Ollama transcription
- Native Swift/SwiftUI implementation
- Payment processing
- Estimate generation
