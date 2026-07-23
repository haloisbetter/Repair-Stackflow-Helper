# Guided Check-In Workflow

## Overview

The Guided Check-In workflow enables an employee to assist a customer through a structured device intake conversation. The application operates in two modes — **Assistant Mode** (chat-based technician note formatting) and **Guided Check-In Mode** (structured intake with audio capture). A prominent mode switch is always visible in the header.

Audio capture is **consent-gated** — no microphone activity occurs until the customer explicitly grants consent. The system transcribes the conversation, progressively extracts structured fields, detects missing required fields and conflicts, generates a technician-friendly symptom summary, and supports customer/device matching suggestions — all reviewed by the employee before submission.

This is an **employee-assisted** workflow, not an autonomous kiosk.

## Two-Mode Interface

### Mode Switch

A visible `[ Assistant ] [ Guided Check-In ]` tab switch sits directly beneath the header. It is:
- Always visible (never hidden in the overflow menu)
- Keyboard accessible (tab + enter)
- Shows clear active state
- Works in narrow companion windows

### State Preservation

- Assistant Mode and Guided Mode maintain separate view state
- Switching modes does not destroy active work
- Active check-in sessions persist in the backend session store
- Switching back to Guided mode restores the active session exactly where it was
- Assistant chat history remains intact while Guided mode is active
- Active recording shows a persistent indicator in Assistant Mode via the active-session banner
- Starting a new check-in while one is active requires confirmation
- Cancelling a session with entered information requires confirmation

### Active-Session Banner

When a check-in session exists, Assistant Mode shows a persistent banner:
- "Guided Check-In in progress"
- Customer name (when safely available)
- Session state
- Recording state
- "Return to Check-In" button

No customer information is exposed in diagnostics or browser title text.

## Guided Check-In Layout

The Guided mode workspace uses four collapsible sections:

1. **Listening & Transcript** — Recording controls, consent gate, live transcript
2. **Customer & Device** — Quick-fire intake fields
3. **Issue & Intake Details** — Critical questions, accessories, extracted fields, conflicts, missing fields
4. **Review & Symptom Summary** — Summary generation and final review access

A **Readiness Panel** sits between sections 3 and 4, showing:
- Required fields completed: X/Y
- Missing information count
- Unresolved conflicts count
- Consent status
- Transcript segment count
- Summary status
- Overall readiness: Ready for Review / Needs Information / Blocked by Conflict

### Start Screen

When no check-in is active, Guided mode shows:
- "Start New Check-In" button
- "Continue Manually" button
- Microphone and transcription provider status
- Mock badge when development mode is active

## Microphone Controls

### Consent Gate

Before consent is granted, the recording card shows:
- Clear "Customer consent required" message
- Grant Consent button
- Declined button
- Continue Manually button

### Recording States

**Before listening** (consent granted, idle):
- Large "Start Listening" button with microphone icon

**While listening:**
- Red recording indicator with pulse animation
- Elapsed time counter
- Audio level meter
- Microphone device selector (when multiple devices available)
- Pause and Stop buttons

**When paused:**
- "Paused" label with elapsed time
- Resume and Stop buttons

**When stopped:**
- "Process Conversation" button
- "Add More Conversation" button

Microphone controls are never hidden inside a menu or small icon.

## Real Browser Audio Capture

### Implementation

The `useMicrophone` hook implements real browser audio capture:

1. **Consent check** — `getUserMedia` is only called after consent is granted and the employee clicks "Start Listening"
2. **MediaStream creation** — `navigator.mediaDevices.getUserMedia({ audio: true })` creates a real `MediaStream`
3. **MediaRecorder** — A `MediaRecorder` instance records audio in 1-second chunks
4. **Audio chunk collection** — Chunks are collected and flushed every 5 seconds via `requestData()`
5. **Audio bytes to transcription** — Each blob is sent as `application/octet-stream` to the `/api/v1/checkin/sessions/:id/transcript/audio` endpoint
6. **No raw audio persistence** — Audio blobs are not stored; only transcript segments are kept

### Track Cleanup

All `MediaStreamTrack` instances are stopped on:
- Stop button
- Cancel session
- Consent withdrawal
- Component unmount
- Browser error
- Session expiration

### Error Handling

Visible errors are shown for:
- `unsupported` — Browser does not support `getUserMedia` or `MediaRecorder`
- `denied` — Microphone permission denied (`NotAllowedError`)
- `no_device` — No microphone found (`NotFoundError`)
- `disconnected` — Microphone unavailable or disconnected (`NotReadableError`)
- `provider_error` — Transcription provider failure
- `unknown` — Other errors

### Mock Transcription

Mock transcription is clearly labeled with a "MOCK" badge. It is only used when the mock provider is explicitly active. Real recording failures are shown as errors — mock transcripts are never silently substituted.

### Local Transcription Provider

The `LocalTranscriptionProvider` accepts raw audio bytes via HTTP POST to a configurable endpoint (e.g., `http://localhost:8080/transcribe`). It sends `application/octet-stream` and expects a JSON response with transcript segments. No audio leaves the device.

## Quick-Fire Intake Controls

The employee can capture common intake information without waiting for AI extraction:

### Customer Section
- New customer / Existing customer toggle
- First name, Last name, Phone, Email text inputs
- Preferred contact: Call / Text / Email

### Device Section
- Device type quick buttons: Mac, Windows PC, iPhone, iPad, Android, Gaming console, Other
- Manufacturer, Model, Serial number, Color text inputs

### Issue Section
- Issue type quick buttons: No power, Slow, Won't boot, Broken screen, Liquid damage, Data recovery, Battery issue, Charging issue, Software issue, Virus or scam, Other
- Detailed description textarea

Selecting a quick issue adds a structured fact but does not replace the customer's detailed description.

## Critical Questions

Fast segmented controls for:

| Question | Options |
|----------|---------|
| Liquid exposure | Yes / No / Unsure |
| Physical damage | Yes / No / Unsure |
| Backed up | Yes / No / Unsure |
| Device powers on | Yes / No / Intermittent / Unsure |
| Data important | Critical / Important / Not important / Unsure |
| Prior repair | Yes / No / Unsure |
| Find My (Apple) | Off / On / Unsure / N/A |
| Passcode handling | Customer will enter / Secure flow / Not available / Not required |

Passcodes are never displayed or stored in this panel.

## Accessories

Tap-friendly toggle controls for:
- Charger, Power adapter, Cable, Case, Bag, External drive, Other, Device only

Selected accessories are included in the final reviewed intake.

## Quick Customer Statements

Employee-facing question prompt chips:
- "When did this start?"
- "Does it happen every time?"
- "What happened immediately before it started?"
- "What have you already tried?"
- "Is your data backed up?"
- "Was there any liquid exposure?"
- "Has anyone repaired it before?"
- "Did you bring the charger?"
- "Is Find My turned off?"

These insert text into the manual note input — they are not automated spoken questions.

## Live Transcript

The transcript display shows:
- Final and interim segments (interim styled distinctly)
- Timestamps
- Speaker role badges (customer/employee/unknown)
- Mock label when applicable
- Manual note input for adding employee notes

## Structured Extraction

As transcription arrives:
- Fields update progressively
- Employee-confirmed values are never overwritten
- AI-filled fields are visually labeled ("AI detected", "AI inferred", "Needs confirmation", "Conflict")
- Source segment references are preserved internally

## Symptom Summary

Live editable preview with:
- Generate, Regenerate, Edit, Copy buttons
- Concise, technician-friendly text
- No diagnosis unless explicitly confirmed
- No passcode or unnecessary personal details
- Uncertainties preserved
- Warnings for data concerns

The employee can manually write or edit the summary without requiring a complete transcript.

## Final Review

A dedicated final-review view displays:

**Customer:** name, phone, email, preferred contact
**Device:** category, manufacturer, model, serial, color
**Intake:** reported issue, issue type, liquid exposure, physical damage, power state, backup, data importance, accessories, Find My, passcode handling
**Review:** symptom summary, missing fields, conflicts, warnings, consent record, provider provenance, mock status

Actions:
- Accept Check-In (blocked by unresolved conflicts unless override reason provided)
- Edit and Accept
- Return to Intake
- Reject
- Copy Manually
- Cancel Session

## Session Lifecycle

13-state state machine: `created → awaiting_consent → ready → listening ⇄ paused → processing → needs_information → ready_for_review → accepted/rejected/cancelled/expired/error`

## Temporary Session Storage

Bounded in-memory store:
- Maximum 16 sessions
- Maximum 500 transcript segments per session
- Maximum 256 KB transcript per session
- 1 hour TTL

Session metrics expose only counts and timestamps — no transcript content, customer data, or symptom text.

## Privacy Controls

- Consent-gated capture
- Passcode exclusion from extraction and storage
- Prompt injection detection
- Local transcription (no audio leaves device)
- Bounded storage with auto-expiry
- Metrics privacy
- Employee review before submission
- No customer details in diagnostics or browser title

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/checkin/sessions` | Create session |
| GET | `/api/v1/checkin/sessions/:id` | Get session |
| POST | `/api/v1/checkin/sessions/:id/consent` | Record consent |
| POST | `/api/v1/checkin/sessions/:id/capture/start` | Start capture |
| POST | `/api/v1/checkin/sessions/:id/capture/pause` | Pause capture |
| POST | `/api/v1/checkin/sessions/:id/capture/resume` | Resume capture |
| POST | `/api/v1/checkin/sessions/:id/capture/stop` | Stop capture |
| POST | `/api/v1/checkin/sessions/:id/transcript/audio` | Submit audio bytes |
| POST | `/api/v1/checkin/sessions/:id/transcript/mock` | Add mock transcript (dev) |
| POST | `/api/v1/checkin/sessions/:id/transcript/manual` | Add manual note |
| POST | `/api/v1/checkin/sessions/:id/extract` | Run field extraction |
| PUT | `/api/v1/checkin/sessions/:id/fields` | Update fields |
| POST | `/api/v1/checkin/sessions/:id/summarize` | Generate symptom summary |
| POST | `/api/v1/checkin/sessions/:id/review` | Submit review decision |
| POST | `/api/v1/checkin/sessions/:id/cancel` | Cancel session |
| GET | `/api/v1/checkin/transcription/health` | Provider health |
| GET | `/api/v1/checkin/metrics` | Session metrics |
| POST | `/api/v1/checkin/matches/customers` | Search customer matches |
| POST | `/api/v1/checkin/matches/devices` | Search device matches |

## Task Naming

The canonical task name is `summarize_checkin_symptoms` (not `draft_symptom_summary`). This is consistent across:
- Approved task definitions
- Enabled task list
- Tool registry
- Contracts
- API routes
- Tests
- Documentation

## Manual Fallback

When consent is declined, the employee can enter all fields using the quick-fire controls. Manual mode is indicated in the UI. The session proceeds through review and submission without audio capture.

## Exclusions

- Autonomous kiosk mode
- Wake words or hot-word detection
- Background listening
- PIMS automation (suggestions only, no auto-merge)
- Store AI Gateway integration
- Remote Ollama transcription
- Native Swift/SwiftUI implementation
- Payment processing
- Estimate generation
- Text-to-speech
- Phone-call recording
