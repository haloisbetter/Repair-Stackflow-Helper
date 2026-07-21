# Instruction Composition

Sprint 3 introduces a prompt composer that assembles the final system prompt from five distinct segments, each with clear trust boundaries.

## Composition Order

The `composePrompt` function assembles segments in this fixed order:

1. **Platform Safety** — sandbox constraints (no code execution, no filesystem, no network)
2. **Trusted Task** — the task template's system prompt (e.g., note formatting rules)
3. **Organization Instructions** — compiled from the InstructionProfile
4. **Untrusted Input** — the technician's raw note, wrapped in delimiters
5. **Output Schema** — the expected JSON output format

Each segment is wrapped in begin/end delimiters (e.g., `===PLATFORM_SAFETY_BEGIN===` / `===PLATFORM_SAFETY_END===`) so the AI model can clearly distinguish trust boundaries.

## InstructionProfile

The organization instructions segment is compiled by `composeInstructionBlock` from the InstructionProfile:

- **globalInstructions** — always included
- **toneRules** — numbered list, included if non-empty
- **formattingRules** — numbered list, included if non-empty
- **prohibitedClaims** — numbered list, included if non-empty
- **escalationRules** — numbered list, included if non-empty

Empty rule lists are omitted entirely — no empty section headers appear in the composed prompt.

## Validation

Instruction profile text fields are validated to reject:

- HTML tags (`<tag>`)
- URLs (http, https, ftp, file, data, javascript, vbscript)
- Shell commands (rm, sudo, chmod, chown, exec, eval, system)
- Secrets (password, api_key, token, credential with `:` or `=`)
- Model names (gpt, claude, llama, mistral, gemini, bard, copilot)

This prevents instruction injection from overriding the platform safety or trusted task segments.

## Job Runner Integration

The job runner calls `composePrompt` to build the system prompt before sending the execution request to the AI provider. The composed prompt replaces the task template's standalone system prompt while preserving the task-specific rules within the "trusted task" segment.
