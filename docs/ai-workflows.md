# AI Workflow Architecture — Technician Note & Customer Update

## Overview

This document describes the two completed AI workflows: `format_technician_note` and `draft_customer_update`. Both follow a proposal-review model where AI output is always a draft requiring employee review before final disposition.

## Technician Note Workflow

### Input Schema (v1.0)
- `technicianNote` (string, 1-4096 chars)
- `outputStyle` ("professional_repair_note")

### Output Schema (v1.1)
- `formattedNote` — clean professional version
- `customerReportedIssue` — customer-reported symptoms
- `technicianFindings` — explicitly stated findings
- `workPerformed` — explicitly stated work actions
- `unresolvedIssues` — remaining issues
- `recommendations` — recommended next steps
- `warnings` — missing, conflicting, or uncertain info
- `uncertainStatements` — technician uncertainty captured
- `omittedSensitiveContent` — passwords/passcodes detected and omitted
- `sourceFactsUsed` — key facts extracted
- `sourceFactsExcluded` — excluded facts and why
- `recommendedNextStep` — single most important next step

### Prompt Template (v1.1)
Preserves prompt composition order: platform safety → trusted task instructions → organization instructions → untrusted input → output schema. The technician note is wrapped in `===TECHNICIAN_NOTE_BEGIN===` / `===TECHNICIAN_NOTE_END===` delimiters and labeled as untrusted.

### Anti-Fabrication Rules
The system prompt explicitly prohibits inventing: diagnoses, prices, dates, warranty status, parts availability, customer approval, technician actions, repair completion, data-backup status, liquid-damage findings, and device passcodes.

## Customer Update Workflow

### Input Schema (v1.0)
Structured input with confirmation levels:
- `confirmed` — verified, can be stated to customer
- `unconfirmed` — not verified, use cautious language
- `internal_only` — never include in customer-facing content
- `unknown` — note the gap

Fields: customerFirstName, deviceDescription, repairStatus, confirmedDiagnosis, confirmedWorkPerformed, confirmedEstimate, confirmedApprovalState, confirmedPartStatus, confirmedCompletionState, requiredCustomerAction, nextExpectedStep, employeeNotesSafeForCustomer, communicationChannel, requestedTone, organizationInstructions.

### Output Schema (v1.0)
- `customerFacingDraft` — the draft message
- `subjectLine` — optional, for email
- `communicationChannel` — sms/email/phone_call/in_person
- `confirmedFactsUsed` — confirmed facts in the draft
- `factsExcluded` — excluded facts and why
- `requiredCustomerAction` — customer action needed
- `nextStep` — next expected step
- `warnings` — missing/uncertain info
- `uncertainOrMissingInformation` — gaps to verify
- `prohibitedClaimsAvoided` — claims avoided due to lack of confirmation

### Safety Rules
Never states: repair complete (unless confirmed), diagnosis final (unless confirmed), part arrived (unless confirmed), estimate approved (unless confirmed), price final (unless confirmed), data safe (unless confirmed), data recovery success, deadline guaranteed, Apple warranty (unless confirmed), customer authorized work (unless confirmed).

Never includes: internal commentary, passcodes, passwords, internal cost, profit margins, vendor credentials, employee criticism, security details, speculative diagnosis, unapproved estimates, internal-only warnings.

### Prompt Template (v1.0)
Same composition order. Customer/repair content wrapped in `===CUSTOMER_UPDATE_INPUT_BEGIN===` / `===CUSTOMER_UPDATE_INPUT_END===` and labeled untrusted. Organization instructions may adjust tone but cannot override factuality or privacy rules.

## Proposal Review Lifecycle

### Review States
1. `pending_review` — AI output generated, awaiting employee review
2. `accepted` — employee accepted as written
3. `accepted_with_edits` — employee edited then accepted
4. `rejected` — employee rejected
5. `expired` — proposal TTL elapsed

### Review Record
Each proposal record includes:
- Proposal ID, job ID, request ID, task name
- Task, input, output, prompt template versions
- Submission key, attempt number, previous proposal ID
- Proposed result, edited result (when applicable)
- Review status, reviewer ID, reviewed timestamp
- Reject reason category (when rejected)
- Edit metrics (field count, character delta)
- Full provenance

### Reject Reasons
`invented_fact`, `missing_fact`, `incorrect_tone`, `incorrect_structure`, `privacy_issue`, `unclear`, `duplicate`, `other`

### Regeneration
Creates a new proposal attempt linked to the same job via `previousProposalId`. Does not silently replace the previous proposal.

### Transitions
- `pending_review` → `accepted`, `accepted_with_edits`, `rejected`, `expired`
- All other states are terminal (immutable)

## Development Review Mode

In development mode:
- `TemporaryProposalStore` holds proposals in memory (max 64, 30-minute TTL)
- Review routes: `GET /api/v1/review/proposals`, `GET /api/v1/review/proposals/:jobId`, `GET /api/v1/review/proposals/:jobId/latest`, `POST /api/v1/review/decision`
- Employee can accept, edit-accept, reject, or regenerate
- Clearly labeled as development mode
- Does not pretend the work order was permanently updated
- Manual copy available

## Production Review Contract

In production mode:
- Proposals submitted to Repair StackFlow via backend client
- Review disposition received from Repair StackFlow
- Stable IDs and submission keys preserve idempotency
- No duplicate accepted results

The backend-client abstraction supports extension for `submitProposal`, `fetchProposalStatus`, and `submitReviewDecision` using the existing interface pattern.

## Provenance Captured

Every proposal includes:
- `provider` (ollama/mock)
- `model`
- `executionTarget` (local_on_this_machine)
- `durationMs`
- `mockProviderUsed`
- `assistantProfileVersion`
- `instructionProfileVersion`
- `toolPolicyVersion`
- `taskName`, `taskVersion`
- `inputSchemaVersion`, `outputSchemaVersion`
- `promptTemplateVersion`
- `submissionKey`
- `attemptNumber`
- `jobId`, `requestId`

No hidden reasoning or chain-of-thought is included in output.

## Idempotency

- Backend-issued `submissionKey` used in production mode
- Local computed hash used in development mode
- Duplicate submission detection via `getBySubmissionKey`
- Different jobs with identical content remain distinct (separate proposal IDs)
- Duplicate review decisions rejected (already-reviewed proposals are immutable)

## Temporary Storage

- Max 64 proposals in memory
- 30-minute TTL
- Content never exposed in diagnostics or status endpoints
- Metrics (counts, statuses) available without content
- Proposals deleted after TTL expiry

## Ollama Provider Improvements

- Structured output via `format: "json"` parameter
- Timeout classification (TimeoutError → timed_out)
- Model-not-found classification (HTTP 404 → model not found)
- Byte-based response limit enforcement
- No silent fallback to mock
- Provider/model provenance in every result

## Evaluation Fixtures

### Technician Note Fixtures (14)
poorly written note, no-power device, liquid damage, uncertain diagnosis, conflicting information, missing findings, data-recovery risk, Apple device, Windows device, no repair performed yet, password embedded in text, prompt injection, price mentioned but not confirmed, warranty mentioned but not confirmed.

### Customer Update Fixtures (12)
diagnostic update, waiting for approval, waiting for parts, repair complete, repair not complete, estimate not approved, customer action required, missing diagnosis, internal-only note, uncertain arrival date, data-recovery uncertainty, prompt injection.

### Evaluation Metrics
- Schema compliance (Zod validation)
- Factual preservation (source facts tracked)
- Invented claims (workPerformed only includes explicit actions)
- Sensitive information leakage (omittedSensitiveContent tracking)
- Warnings generated
- Prohibited content detection
- Provider/model provenance

## Privacy Controls

- Passwords and passcodes detected and omitted from formatted notes
- Internal-only notes excluded from customer-facing drafts
- Redaction function strips sensitive keys from diagnostics
- Proposal content never appears in status endpoints or diagnostics
- SAFE_DIAGNOSTIC_KEYS list excludes all content fields

## How to Test

### Mock Mode
1. Set provider to "mock" in developer settings
2. Submit a technician note through the conversation UI
3. Review the structured output with DEV MOCK badge
4. Accept, edit-accept, reject, or regenerate via review routes

### Ollama Mode
1. Set provider to "ollama" in developer settings
2. Ensure Ollama is running at `http://127.0.0.1:11434`
3. Ensure `llama3.2` model is available
4. Submit notes or customer update requests
5. Review output with real provider provenance

### Running Tests
- `npm test` — all 323 tests
- `npx vitest run tests/evaluation/` — evaluation fixtures
- `npx vitest run tests/review/` — review lifecycle tests

## Known Limitations

- No real Repair StackFlow backend deployment verified
- No real Ollama instance available in test environment
- Mock provider is deterministic (not a real AI); it preserves text rather than transforming it intelligently
- Evaluation metrics are measured against mock output, not real AI output
- Production review contracts are defined but not verified against a live backend
- UI review panel shows runtime status but does not yet render full proposal review cards inline
- No macOS Keychain, SwiftUI, voice, or PIMS integration (excluded by scope)
