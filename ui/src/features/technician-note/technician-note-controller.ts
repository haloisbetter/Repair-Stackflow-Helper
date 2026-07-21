import { api, type BootstrapResponse, type JobResult, type TestAiResponse } from "../../app/api-client.js";
import {
  type ConversationState,
  type ConversationIntent,
  addWelcomeMessage,
  addHelperMessage,
  addUserInput,
  addStatusNotification,
  addResultCard,
  addWarningCard,
  addErrorCard,
  addProcessingMessage,
  addChips,
  removeProcessing,
  clearConversation,
  setPendingNote,
  setActiveIntent
} from "../../app/app-state.js";

export interface ActionResult {
  state: ConversationState;
  data?: unknown;
}

export function mapChipToIntent(chip: string): ConversationIntent | null {
  const map: Record<string, ConversationIntent> = {
    "Format note": "format_technician_note",
    "Format technician note": "format_technician_note",
    "Format another": "format_technician_note",
    "Test AI": "test_ai_connection",
    "Test AI connection": "test_ai_connection",
    "Try again": "test_ai_connection",
    Status: "view_status",
    "View current status": "view_status",
    Clear: "clear_conversation",
    "Clear conversation": "clear_conversation"
  };
  return map[chip] ?? null;
}

export function isApprovedIntent(intent: ConversationIntent | null): boolean {
  return intent !== null;
}

export async function handleIntent(
  intent: ConversationIntent,
  state: ConversationState,
  bootstrap: BootstrapResponse | null
): Promise<ActionResult> {
  switch (intent) {
    case "format_technician_note": {
      let s = setActiveIntent(state, "format_technician_note");
      s = addHelperMessage(s, "Paste or type the rough technician note.");
      return { state: s };
    }

    case "test_ai_connection": {
      let s = addProcessingMessage(state, "Testing AI connection…");
      try {
        const result = await api.testAi();
        s = removeProcessing(s);
        if (result.ollamaReachable && result.modelAvailable) {
          s = addStatusNotification(
            s,
            `Ollama is reachable.\nConfigured model is available.\nResponse time: ${result.latencyMs ?? "—"} ms.`
          );
        } else {
          s = addErrorCard(
            s,
            "Ollama unavailable",
            result.detail
              ? `Could not reach Ollama: ${result.detail}`
              : "I could not reach Ollama on this machine.",
            ["Try again", "AI settings", "Use mock"]
          );
        }
        return { state: s, data: result };
      } catch (e) {
        s = removeProcessing(s);
        s = addErrorCard(
          s,
          "Connection test failed",
          e instanceof Error ? e.message : String(e),
          ["Try again"]
        );
        return { state: s };
      }
    }

    case "view_status": {
      if (!bootstrap) {
        return { state: addErrorCard(state, "Status unavailable", "Could not load Helper status.") };
      }
      const paired = bootstrap.identity.pairingState === "paired_ready";
      const providerLabel =
        bootstrap.config.providerSelection === "mock"
          ? "Mock (deterministic)"
          : bootstrap.config.providerSelection === "ollama"
            ? "Local Ollama"
            : "Auto (prefer Ollama)";
      const healthLabel = bootstrap.health
        ? bootstrap.health.state === "ready"
          ? "Ready"
          : bootstrap.health.state === "degraded"
            ? "Degraded"
            : "Unavailable"
        : "Unknown";
      const orgLabel = bootstrap.lastPairing?.locationName ?? bootstrap.identity.organizationId ?? "Not paired";
      const lines = [
        `Status: ${paired ? "Paired" : "Not paired"}`,
        `Organization: ${orgLabel}`,
        `Role: ${bootstrap.identity.role}`,
        `Provider: ${providerLabel}`,
        `Model: ${bootstrap.config.approvedModel}`,
        `Health: ${healthLabel}`
      ];
      return { state: addStatusNotification(state, lines.join("\n")) };
    }

    case "clear_conversation": {
      try {
        await api.clear();
      } catch {
        // Non-fatal: local clear still works
      }
      let s = clearConversation(state);
      s = addWelcomeMessage(s);
      return { state: s };
    }

    case "open_settings": {
      return { state: setActiveIntent(state, "open_settings") };
    }

    case "welcome":
    default: {
      let s = addWelcomeMessage(state);
      if (bootstrap?.config.providerSelection === "mock") {
        s = addWarningCard(
          s,
          "Development Mode",
          "The deterministic mock provider is active. Results are for testing only."
        );
      }
      return { state: s };
    }
  }
}

export async function submitTechnicianNote(
  state: ConversationState,
  note: string,
  bootstrap: BootstrapResponse | null
): Promise<ActionResult> {
  if (state.isProcessing) {
    return { state };
  }
  if (!bootstrap || bootstrap.identity.pairingState !== "paired_ready") {
    return {
      state: addErrorCard(
        state,
        "Not paired",
        "The Helper must be paired before formatting notes.",
        ["Open settings"]
      )
    };
  }

  let s = addUserInput(state, note);
  s = setPendingNote(s, note);
  s = addProcessingMessage(s, "Formatting technician note…");
  s = setActiveIntent(s, "format_technician_note");

  try {
    const response = await api.formatNote(note);
    s = removeProcessing(s);
    s = setPendingNote(s, null);
    if (response.status === "completed" && response.result) {
      s = addResultCard(s, response.result);
      return { state: s, data: response.result };
    }
    const code = response.failure?.errorCode ?? "internal_error";
    const retriable = response.failure?.retriable ?? false;
    s = addErrorCard(
      s,
      "Formatting failed",
      `Error: ${code}${retriable ? " (retryable)" : ""}`,
      retriable ? ["Try again", "Clear"] : ["Clear"]
    );
    return { state: s };
  } catch (e) {
    s = removeProcessing(s);
    s = setPendingNote(s, null);
    s = addErrorCard(
      s,
      "Formatting failed",
      e instanceof Error ? e.message : String(e),
      ["Try again", "Clear"]
    );
    return { state: s };
  }
}
