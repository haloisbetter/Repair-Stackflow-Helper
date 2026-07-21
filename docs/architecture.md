# Architecture — Repair StackFlow Helper (Development Prototype)

## Purpose

The Repair StackFlow Helper is a local execution agent that runs approved AI tasks on behalf of the Repair StackFlow web application. This repository contains the **first runnable MVP**: a development-only, Linux-runnable execution-core prototype. It is **not** the production native macOS application.

## Ownership Boundary

| Owned by Repair StackFlow Web App | Owned by Repair StackFlow Helper |
|---|---|
| Users and employee authentication | Local execution |
| Organizations, locations | Ollama communication |
| Customers, devices, work orders | Approved task routing |
| Permanent technician notes | Structured-response validation |
| AI-job authorization | Temporary processing |
| Final result review | Local health reporting |
| Audit history, permanent business records | Sanitized diagnostics |

The Helper never persists customer, work-order, CRM, PSA, billing, or permanent technician-note data.

## Why a Linux-Runnable Prototype First

The production target is a native SwiftUI macOS menu-bar application running on Apple Silicon. However, the current Bolt development environment is Linux without Swift/Xcode or macOS Keychain. To prove the execution core, contracts, and job lifecycle quickly and testably, this MVP uses TypeScript + Node.js + Fastify + Zod + Vitest. The contracts and behavior are designed to be reproducible in Swift later.

## Module Map

- `src/config` — environment loading and Helper execution-target configuration.
- `src/contracts/v1` — the versioned shared protocol (Zod schemas): common types, pairing, heartbeat, jobs, results, errors.
- `src/helper` — Helper identity, centralized state machine, development pairing simulation, health service.
- `src/ai` — provider-independent `AIProvider` interface, `OllamaProvider`, deterministic `MockAIProvider`, provider health, model-role registry.
- `src/tasks` — approved task registry and the `format_technician_note` task (contract, trusted prompt template, formatter, response validator).
- `src/jobs` — job validator, centralized job runner, temporary in-memory job store, idempotency key service.
- `src/diagnostics` — sanitized diagnostic service and redaction utility.
- `src/routes` — Fastify route registration for health, pairing, jobs, diagnostics.
- `src/app.ts` / `src/server.ts` — Fastify composition and loopback server entry.
- `ui/` — small React/Vite development status interface.

## Local vs Remote AI

The MVP fully implements `local_on_this_machine` against a loopback Ollama endpoint (`http://127.0.0.1:11434`). `remote_store_ai` is represented in the configuration model but returns a clear `not_configured` status; production remote gateway authentication is deferred.

The provider selection is explicit: `auto` (prefer Ollama), `ollama`, or `mock`. The Helper never silently falls back from Ollama to the mock provider. Every result states which provider was used.

## Privacy and Temporary Data

- No permanent business-data storage. All job content lives in bounded in-memory storage.
- Maximum one active job; a small maximum number of completed development results; results expire.
- Original technician-note content is removed from active processing state after completion.
- All temporary content is lost when the process stops.
- Diagnostics contain only operational metadata (Helper ID, role, state, endpoint host, provider health, job ID, task name, duration, byte counts, error codes). Diagnostics never contain note text, formatted notes, customer names, tokens, raw prompts, or raw AI responses. A redaction utility is tested.

## Approved Tasks

Only `format_technician_note` is enabled. `health_check` and `draft_customer_update` are reserved in the protocol but return `task_not_enabled`. Arbitrary chat is not supported. A job can never supply a system prompt, model, endpoint, shell command, file path, or tool definition.

## Verification Limits

This environment can run the Node server, the Vitest suite, and the Vite dev UI. It cannot compile Swift, run a native macOS app, use Keychain, or reach a real Ollama instance. Ollama health checks are tested with stubbed `fetch`; real Ollama was not exercised unless a live endpoint responded.
