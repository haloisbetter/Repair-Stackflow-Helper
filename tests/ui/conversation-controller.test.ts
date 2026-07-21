import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapChipToIntent,
  handleIntent,
  submitTechnicianNote
} from "../../ui/src/features/technician-note/technician-note-controller.js";
import { createInitialState } from "../../ui/src/app/app-state.js";
import * as apiModule from "../../ui/src/app/api-client.js";
import type { BootstrapResponse } from "../../ui/src/app/api-client.js";

const mockBootstrap: BootstrapResponse = {
  identity: {
    helperName: "Test Helper",
    role: "combined",
    pairingState: "paired_ready",
    organizationId: "computer-concepts-dev",
    locationId: "yorktown-dev",
    appVersion: "0.1.0-dev"
  },
  config: {
    executionTarget: "local_on_this_machine",
    providerSelection: "mock",
    ollamaEndpoint: "http://127.0.0.1:11434",
    approvedModel: "llama3.2",
    mockProviderEnabled: true
  },
  health: {
    state: "ready",
    provider: "mock",
    ollamaReachable: false,
    modelAvailable: true,
    latencyMs: 0
  },
  assistant: {
    name: "Helper",
    subtitle: "Repair Assistant",
    welcomeMessage: "Ready to help with today's repairs.",
    avatar: { type: "initials", value: "H" },
    appearance: { accentColor: "#2f8f83" },
    profileVersion: 1
  },
  runtimeConfig: {
    assistant: {
      name: "Helper",
      subtitle: "Repair Assistant",
      welcomeMessage: "Ready to help with today's repairs.",
      avatar: { type: "initials", value: "H" },
      appearance: { accentColor: "#2f8f83" },
      profileVersion: 1
    },
    instructions: {
      globalInstructions: "You are a repair-shop assistant.",
      toneRules: [],
      formattingRules: [],
      prohibitedClaims: [],
      escalationRules: [],
      profileVersion: 1
    },
    enabledTools: ["format_technician_note"],
    modelRole: "drafting",
    compiledAt: "2026-01-01T00:00:00Z"
  },
  enabledTools: ["format_technician_note"],
  configuration: {
    loaded: false,
    schemaVersion: null,
    source: "defaults",
    lastSave: null,
    persistenceHealthy: true,
    lastPersistenceErrorCode: null,
    warning: null
  },
  lastPairing: { organizationId: "computer-concepts-dev", locationName: "Yorktown" }
};

describe("conversation controller - chip mapping", () => {
  it("maps Format note to format_technician_note", () => {
    expect(mapChipToIntent("Format note")).toBe("format_technician_note");
  });
  it("maps Test AI to test_ai_connection", () => {
    expect(mapChipToIntent("Test AI")).toBe("test_ai_connection");
  });
  it("maps Status to view_status", () => {
    expect(mapChipToIntent("Status")).toBe("view_status");
  });
  it("maps Clear to clear_conversation", () => {
    expect(mapChipToIntent("Clear")).toBe("clear_conversation");
  });
  it("returns null for unknown chips", () => {
    expect(mapChipToIntent("Random action")).toBeNull();
  });
});

describe("conversation controller - handleIntent", () => {
  it("format_technician_note asks for note input", async () => {
    const result = await handleIntent("format_technician_note", createInitialState(), mockBootstrap);
    expect(result.state.items.some((i) => i.type === "helper-message" && i.content?.includes("technician note"))).toBe(true);
    expect(result.state.activeIntent).toBe("format_technician_note");
  });

  it("view_status shows user-relevant info", async () => {
    const result = await handleIntent("view_status", createInitialState(), mockBootstrap);
    const status = result.state.items.find((i) => i.type === "status-notification");
    expect(status?.content).toContain("Paired");
    expect(status?.content).toContain("Yorktown");
    expect(status?.content).toContain("combined");
    expect(status?.content).toContain("llama3.2");
  });

  it("clear_conversation clears and adds welcome", async () => {
    const s = createInitialState();
    s.items.push({ id: "x", type: "user-input", content: "old", timestamp: 0 });
    const result = await handleIntent("clear_conversation", s, mockBootstrap);
    expect(result.state.items.length).toBe(2); // welcome + chips
    expect(result.state.items.some((i) => i.content === "old")).toBe(false);
  });

  it("welcome shows dev mode warning when mock is active", async () => {
    const result = await handleIntent("welcome", createInitialState(), mockBootstrap);
    expect(result.state.items.some((i) => i.type === "warning-card")).toBe(true);
  });
});

describe("conversation controller - submitTechnicianNote", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates only an approved technician-note job", async () => {
    const mockFormat = vi.spyOn(apiModule.api, "formatNote").mockResolvedValue({
      status: "completed",
      result: {
        schemaVersion: "1.0",
        jobId: "j1",
        requestId: "r1",
        helperId: "h1",
        task: "format_technician_note",
        status: "completed",
        idempotencyKey: "k1",
        provider: "mock",
        executionTarget: "local_on_this_machine",
        model: "llama3.2",
        result: {
          formattedNote: "Professional note.",
          customerReportedIssue: "Laptop shuts off.",
          technicianFindings: [],
          recommendedNextStep: "Run diagnostics.",
          warnings: []
        },
        timing: { startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:00:01Z", durationMs: 1 }
      }
    });
    const result = await submitTechnicianNote(createInitialState(), "rough note", mockBootstrap);
    expect(mockFormat).toHaveBeenCalledWith("rough note");
    expect(result.state.items.some((i) => i.type === "result-card")).toBe(true);
    expect(result.state.isProcessing).toBe(false);
  });

  it("free-form text cannot become arbitrary chat", async () => {
    const mockFormat = vi.spyOn(apiModule.api, "formatNote").mockResolvedValue({
      status: "completed",
      result: {
        schemaVersion: "1.0",
        jobId: "j1",
        requestId: "r1",
        helperId: "h1",
        task: "format_technician_note",
        status: "completed",
        idempotencyKey: "k1",
        provider: "mock",
        executionTarget: "local_on_this_machine",
        model: "llama3.2",
        result: {
          formattedNote: "Note",
          customerReportedIssue: "Issue",
          technicianFindings: [],
          recommendedNextStep: "Step",
          warnings: []
        },
        timing: { startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:00:01Z", durationMs: 1 }
      }
    });
    await submitTechnicianNote(createInitialState(), "tell me a joke about computers", mockBootstrap);
    expect(mockFormat).toHaveBeenCalledWith("tell me a joke about computers");
    expect(mockFormat.mock.calls.length).toBe(1);
  });

  it("duplicate send does not create second execution while processing", async () => {
    const state = createInitialState();
    state.isProcessing = true;
    const mockFormat = vi.spyOn(apiModule.api, "formatNote");
    await submitTechnicianNote(state, "note", mockBootstrap);
    expect(mockFormat).not.toHaveBeenCalled();
  });

  it("shows error when not paired", async () => {
    const unpaired: BootstrapResponse = { ...mockBootstrap, identity: { ...mockBootstrap.identity, pairingState: "unpaired" } };
    const result = await submitTechnicianNote(createInitialState(), "note", unpaired);
    expect(result.state.items.some((i) => i.type === "error-card")).toBe(true);
  });
});

describe("conversation controller - test AI connection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows success when Ollama is reachable", async () => {
    vi.spyOn(apiModule.api, "testAi").mockResolvedValue({
      ollamaReachable: true,
      modelAvailable: true,
      latencyMs: 82,
      status: "available",
      detail: null,
      approvedModel: "llama3.2",
      currentProvider: "auto"
    });
    const result = await handleIntent("test_ai_connection", createInitialState(), mockBootstrap);
    const status = result.state.items.find((i) => i.type === "status-notification");
    expect(status?.content).toContain("reachable");
    expect(status?.content).toContain("82 ms");
  });

  it("shows recovery actions when Ollama is unavailable", async () => {
    vi.spyOn(apiModule.api, "testAi").mockResolvedValue({
      ollamaReachable: false,
      modelAvailable: false,
      latencyMs: null,
      status: "unavailable",
      detail: "fetch failed",
      approvedModel: "llama3.2",
      currentProvider: "auto"
    });
    const result = await handleIntent("test_ai_connection", createInitialState(), mockBootstrap);
    const errorCard = result.state.items.find((i) => i.type === "error-card");
    expect(errorCard).toBeDefined();
    const chips = result.state.items.find((i) => i.type === "action-chips");
    expect(chips?.chips).toContain("Try again");
    expect(chips?.chips).toContain("AI settings");
    expect(chips?.chips).toContain("Use mock");
  });

  it("provider does not switch silently", async () => {
    vi.spyOn(apiModule.api, "testAi").mockResolvedValue({
      ollamaReachable: false,
      modelAvailable: false,
      latencyMs: null,
      status: "unavailable",
      detail: "fetch failed",
      approvedModel: "llama3.2",
      currentProvider: "ollama"
    });
    const selectSpy = vi.spyOn(apiModule.api, "selectProvider");
    await handleIntent("test_ai_connection", createInitialState(), mockBootstrap);
    expect(selectSpy).not.toHaveBeenCalled();
  });
});
