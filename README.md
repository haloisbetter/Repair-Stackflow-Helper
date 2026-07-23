# Repair StackFlow Helper

Local AI execution companion for Repair StackFlow.

**This is a development prototype.** It is not production software. The Repair StackFlow web application remains the permanent system of record.

## What the Helper Does

- Executes approved AI tasks locally (format technician notes via Ollama or deterministic mock)
- Manages assistant profiles (name, subtitle, welcome message, avatar, accent color)
- Enforces organization instructions (global instructions, tone rules, formatting rules, prohibited claims, escalation rules)
- Enforces tool policies (enabled/disabled, allowed roles, confirmation requirements, execution location)
- Provides configuration persistence across restarts (profiles, instructions, tool policies, runtime preferences)
- Provides development pairing (simulated) and diagnostics
- Serves a slim vertical companion UI for development

## What the Helper Does Not Do

- Replace Repair StackFlow (the web app remains the control plane and system of record)
- Store customer data persistently (all job results are temporary, 5-minute TTL)
- Connect to production backends (no Supabase, no Store AI Gateway, no backend job queue)
- Support multiple concurrent users or multi-tenant workloads
- Provide production authentication or authorization
- Act as an unrestricted chatbot or autonomous agent

## Technology

- **Runtime:** Node.js, TypeScript (ES2022, strict mode)
- **Server:** Fastify 5.x, loopback-only binding (127.0.0.1)
- **UI:** React, Vite (development proxy to backend)
- **Validation:** Zod (strict schemas throughout)
- **Testing:** Vitest (203 tests)
- **AI Providers:** Ollama (local LLM), deterministic mock

## Running

```bash
npm ci
npm run dev          # Starts both backend (port 8787) and UI (port 5173)
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start development server |
| `npm run build` | TypeScript compile + Vite production build |
| `npm run typecheck` | TypeScript type checking only |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |

## Implemented Tool

Currently only one tool is implemented: `format_technician_note`

This tool:
1. Accepts a technician's raw note (plain text, max 4096 chars)
2. Composes a system prompt with organization instructions and anti-hallucination rules
3. Sends it to the selected AI provider (Ollama or mock)
4. Validates the structured JSON output against a strict schema
5. Returns: formatted note, customer reported issue, technician findings, recommended next step, warnings

The mock provider produces deterministic output from simple heuristics. It does not call any AI model. Mock output is labeled `provider: "mock"` in all responses.

## AI Providers

### Ollama (Default)

- Connects to local Ollama at `http://127.0.0.1:11434`
- Uses the `/api/chat` endpoint with `stream: false` and `temperature: 0`
- Default model: `llama3.2`
- Health checks via `/api/tags`
- 3-second timeout on health checks, configurable timeout on execution
- **Status:** Implemented and tested against mock fetch. Real Ollama execution has NOT been verified in this environment (no Ollama instance available).

### Mock (Development)

- Deterministic output from regex-based heuristics
- No network calls
- Labeled as `provider: "mock"` in all results
- Disabled in production mode

## Configuration Persistence

Assistant profiles, instruction profiles, tool policies, and runtime preferences persist across restarts. See `docs/local-configuration.md` for full details.

- Stored outside the repository in a platform-appropriate directory
- macOS: `~/Library/Application Support/RepairStackFlowHelper/`
- Linux: `$XDG_CONFIG_HOME/repair-stackflow-helper/` or `~/.config/repair-stackflow-helper/`
- Atomic writes with backup prevent corruption
- Invalid configurations fall back to safe defaults
- Export and import available via API and Developer screen
- No secrets, notes, or business content are ever persisted

## API Endpoints

```
GET  /api/v1/health                          — Health check (refreshes provider status)
GET  /api/v1/status                          — Full status (note content is redacted)
GET  /api/v1/conversation/bootstrap          — UI bootstrap data
POST /api/v1/actions/format-technician-note  — Run the formatting tool
POST /api/v1/actions/test-ai                 — Test Ollama connection directly
POST /api/v1/actions/clear                   — Clear temporary results
GET  /api/v1/developer/status                — Developer info (no note content)
POST /api/v1/developer/reset                 — Reset helper state
POST /api/v1/dev/pair                        — Development pairing
POST /api/v1/dev/unpair                      — Unpair
POST /api/v1/dev/provider/select             — Select AI provider
POST /api/v1/dev/config                      — Update runtime configuration
GET  /api/v1/diagnostics                     — Sanitized diagnostics
GET  /api/v1/assistant/profile               — Get assistant profile
PUT  /api/v1/assistant/profile               — Update assistant profile
GET  /api/v1/assistant/instructions          — Get instruction profile
PUT  /api/v1/assistant/instructions          — Update instruction profile
POST /api/v1/assistant/reset                 — Reset assistant to defaults
GET  /api/v1/tools                           — List all tools
POST /api/v1/tools/:toolId/policy            — Update tool policy
POST /api/v1/tools/:toolId/authorize         — Check tool authorization
GET  /api/v1/dev/configuration/export        — Export configuration
POST /api/v1/dev/configuration/import        — Import configuration
POST /api/v1/dev/configuration/reset         — Reset to safe defaults
GET  /api/v1/dev/configuration/status        — Persistence status
```

## Security Model

- Server binds only to loopback (127.0.0.1) in development
- No note content appears in diagnostics or status endpoints (redacted)
- No raw prompts or AI responses appear in diagnostics
- No credentials are persisted in configuration
- Unimplemented tools cannot execute (enforced by tool registry `implemented` flag)
- Arbitrary system prompts, models, or endpoints cannot be supplied via job payloads
- Invalid configuration cannot partially apply (all-or-nothing validation)
- Configuration is stored outside the git repository

## Known Limitations

- **Idempotency is incomplete:** `newJobIds()` generates fresh UUIDs per request, so duplicate detection in the store is unreachable from the conversation route. The idempotency infrastructure exists but does not prevent duplicate execution via the UI action endpoint.
- **Real Ollama not verified:** No real Ollama instance is available in this environment. Provider code is tested against injected mock fetch.
- **`maxResponseBytes` uses character count:** The Ollama provider compares `content.length` (chars) vs. `maxResponseBytes`, not actual byte length. For ASCII content this is correct; for multi-byte UTF-8 it underestimates.
- **Model role registry is unused by configuration:** `model-role-registry.ts` defines roles like `technician_note_formatter` but the persisted configuration uses a different enum (`drafting`, `extraction`, `reasoning`, `fast`). No mapping exists between them.
- **5 dev-only vulnerabilities remain:** All in `vitest`'s internal vite dependency. Not shipped to production.
- **Pairing is development-simulated only:** No real Repair StackFlow backend is contacted.

## Tests

203 tests across 20 test files covering:
- Assistant profile and instruction validation
- Tool registry, policies, and authorization
- Job execution, validation, and idempotency
- Configuration persistence and backup recovery
- Safety baseline (redaction, loopback, mock labeling, input validation)
- UI bootstrap, app state, and components
- Ollama provider (mocked fetch)
- Diagnostics and redaction
- Prompt composition
- Contract validation
