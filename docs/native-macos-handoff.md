# Native macOS Handoff — Next Phase

This document specifies the future native Swift implementation. **The Swift app has not been built yet.** This MVP is a Linux-runnable TypeScript execution-core prototype with a slim vertical companion UI.

## Target

- Language: Swift
- UI: SwiftUI
- Lifecycle: `MenuBarExtra`-based menu-bar application with a popover companion window
- Settings: native SwiftUI `Settings` scene
- Platform: Apple Silicon first; macOS 14+ (Sonoma)
- Concurrency: Swift structured concurrency (`async`/`await`, `Task`)
- Networking: `URLSession` + `Codable`
- Secure storage: macOS Keychain (Security framework)
- Launch: launch-at-login support

## UI Reference: Vertical Companion Interface

The current React/Vite interface is the **visual and interaction reference** for the future SwiftUI app. The slim vertical chat companion (390 × 760 px) with:

- A compact header showing status and menu
- A scrolling conversation feed with message bubbles, result cards, and action chips
- A pinned composer at the bottom
- Modal settings, developer, and about screens

…maps directly to a SwiftUI `MenuBarExtra` popover. The conversation controller, intent mapping, and state transitions in `ui/src/app/app-state.ts` and `ui/src/features/technician-note/technician-note-controller.ts` define the interaction model that the SwiftUI views will reproduce.

The native app will use SwiftUI `ScrollView`, `VStack`, `TextField`, and `Sheet` to recreate this layout. The menu bar icon replaces the compact header; the popover replaces the companion window.

## What Carries Over From This Prototype

- The v1 protocol contracts (`src/contracts/v1`) map directly to Swift `Codable` structs.
- The centralized state machine maps to a Swift `enum` state type with allowed-transition validation.
- The `AIProvider` interface maps to a Swift `protocol AIProvider`.
- `OllamaProvider` maps to a `URLSession`-based Ollama adapter calling `/api/chat` and `/api/tags`.
- `MockAIProvider` maps to a deterministic Swift mock for tests and demo.
- The `TaskRegistry` and trusted prompt templates map to a Swift task-template registry.
- The `StructuredOutputValidator` maps to a Swift validator using the same field rules.
- The `JobRunner` orchestration sequence is reproduced step-for-step.
- The `TemporaryJobStore` maps to an in-memory bounded store with the same TTL and max-count rules.
- The redaction utility maps to a Swift redactor with the same sensitive-key set.
- Idempotency key derivation (`sha256(schemaVersion|jobId|requestId|task)`) is identical.

## What Changes

- Development pairing (`DEV-YORKTOWN` simulation) is replaced by real pairing against the Repair StackFlow web app: short-lived pairing code → revocable device credential issued by the backend.
- The device credential (token) is stored in macOS Keychain, not in memory. Missing credential ⇒ unpaired state.
- The React/Vite development UI is replaced by native SwiftUI menu-bar and settings UI.
- `URLSession` replaces Node `fetch`.
- `AbortSignal.timeout` maps to `URLSessionTask` with `timeoutIntervalForRequest`.
- The Fastify server is removed; the Helper is a foreground app, not an HTTP server, in production.

## What Is Explicitly Deferred

- Microphone capture, audio segmentation, transcription, TTS.
- Guided check-in, autonomous kiosk, check-in drafts.
- Full client RAG, vector databases.
- Model fine-tuning, model downloading/admin.
- Intel Mac or Windows support.
- Production remote gateway authentication.
