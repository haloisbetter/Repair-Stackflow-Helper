# Repair StackFlow Helper

A local AI execution companion for Repair StackFlow. This is a **development prototype** of the Helper execution core — not the production native macOS application.

## What It Does

The Helper runs approved AI tasks locally. The first enabled task is **formatting technician notes**: a technician enters a rough note, the Helper formats it professionally using a local Ollama model (or a deterministic mock provider for testing), and the result can be copied into Repair StackFlow.

## Quick Start

```bash
npm install
npm run dev
```

This starts both the Fastify API server (default port 8787) and the Vite UI dev server (port 5173). Open `http://127.0.0.1:5173` in your browser to see the companion interface.

To run them separately:

```bash
npm run dev:server   # API server only
npm run dev:ui       # UI only
```

## Using the Helper

### 1. Development Pairing

The Helper starts unpaired. Enter a development pairing code to pair it:

- **DEV-YORKTOWN** — pairs to Computer Concepts LLC, Yorktown location
- **DEV-HAMPTON** — pairs to Computer Concepts LLC, Hampton location

Open the menu (⋯ button) → Settings, or use the conversation flow.

This is development pairing only — not production authentication.

### 2. Selecting an AI Provider

From the menu → AI Provider, or from Settings:

- **Ollama** — uses your local Ollama instance at `http://127.0.0.1:11434`
- **Mock** — uses a deterministic mock provider for testing (clearly labeled)
- **Auto** — prefers Ollama, falls back only with explicit user action

Provider switching is always explicit. The Helper never silently switches providers.

### 3. Formatting a Technician Note

1. Click **Format note** in the conversation, or type a note in the composer.
2. The Helper creates an approved versioned job, validates it, and runs the configured provider.
3. The result appears as a structured card with:
   - Formatted note (with copy button)
   - Customer-reported issue
   - Technician findings
   - Recommended next step
   - Warnings (if any)
4. Click **Copy** to copy the formatted note, then paste it into the Repair StackFlow technician note field.

### 4. Testing the AI Connection

Click **Test AI** to check if Ollama is reachable and the configured model is available. The result appears conversationally with response time.

When Ollama is unavailable, the Helper shows recovery actions: try again, open AI settings, or explicitly switch to the mock provider.

### 5. Clearing the Conversation

Click **Clear** to remove the temporary conversation and completed results. This does not unpair the Helper or change configuration.

## Temporary Data

All job content is stored in memory only:
- Maximum one active job at a time
- Up to 8 completed results retained temporarily
- Results expire after 5 minutes
- Original technician-note content is removed after processing
- All temporary content is lost when the process stops

The Repair StackFlow web app remains the permanent system of record. Results must be copied into Repair StackFlow manually — the Helper does not write to work orders.

## Developer Screen

Open the menu (⋯) → Developer to see:
- Runtime info (version, platform, uptime)
- Helper identity (ID, role, pairing state)
- AI runtime (endpoint, model, health status)
- Job state (active/completed jobs, error codes)
- Sanitized diagnostics (never contains note content)
- Development controls (pair, unpair, select provider, reset state)

## API Endpoints

```
GET  /api/v1/health                          — Helper health check
GET  /api/v1/status                          — Full status dump
GET  /api/v1/conversation/bootstrap          — UI bootstrap data
POST /api/v1/actions/format-technician-note  — Run the formatter
POST /api/v1/actions/test-ai                 — Test Ollama connection
POST /api/v1/actions/clear                   — Clear temporary results
GET  /api/v1/developer/status                — Developer info (no note content)
POST /api/v1/developer/reset                 — Reset helper state
POST /api/v1/dev/pair                        — Development pairing
POST /api/v1/dev/unpair                      — Unpair
POST /api/v1/dev/provider/select             — Select AI provider
POST /api/v1/dev/config                      — Update configuration
GET  /api/v1/diagnostics                     — Sanitized diagnostics
```

All endpoints bind to `127.0.0.1` (loopback only).

## Tests

```bash
npm test           # run all tests
npm run typecheck  # TypeScript type checking
npm run build      # production build
```

94 tests pass: 48 core execution tests + 46 UI and conversation tests.

## Current Limitations

- Development prototype — not for production use
- Pairing is simulated with hardcoded development codes
- Only `format_technician_note` is enabled (`health_check` and `draft_customer_update` are reserved)
- Temporary in-memory storage only — no persistent database
- Results must be copied into Repair StackFlow manually
- Native macOS app (SwiftUI, Keychain, menu bar) is not yet built
- No microphone, transcription, text-to-speech, or autonomous check-in
- No arbitrary chat — only approved tasks are executed

## Architecture

See `docs/architecture.md` for the full architecture overview, `docs/protocol-v1.md` for the versioned protocol, `docs/native-macos-handoff.md` for the future Swift implementation plan, and `docs/next-phase-backend-contract.md` for the production backend contract.
