import { describe, it, expect } from "vitest";
import {
  createInitialState,
  addWelcomeMessage,
  addHelperMessage,
  addUserInput,
  addResultCard,
  addWarningCard,
  addErrorCard,
  addProcessingMessage,
  removeProcessing,
  clearConversation,
  setPendingNote,
  setActiveIntent,
  type ConversationState
} from "../../ui/src/app/app-state.js";
import type { JobResult } from "../../ui/src/app/api-client.js";

const mockResult: JobResult = {
  schemaVersion: "1.0",
  jobId: "job-1",
  requestId: "req-1",
  helperId: "helper-1",
  task: "format_technician_note",
  status: "completed",
  idempotencyKey: "key-1",
  provider: "mock",
  executionTarget: "local_on_this_machine",
  model: "llama3.2",
  result: {
    formattedNote: "Professional note.",
    customerReportedIssue: "Laptop shuts off.",
    technicianFindings: ["Battery voltage low."],
    recommendedNextStep: "Run battery diagnostic.",
    warnings: ["Uncertain language in original note."]
  },
  timing: { startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:00:01Z", durationMs: 1000 }
};

describe("app-state", () => {
  it("creates empty initial state", () => {
    const s = createInitialState();
    expect(s.items).toEqual([]);
    expect(s.isProcessing).toBe(false);
    expect(s.activeIntent).toBeNull();
  });

  it("adds welcome message and action chips", () => {
    const s = addWelcomeMessage(createInitialState());
    expect(s.items.length).toBe(2);
    expect(s.items[0]?.type).toBe("helper-message");
    expect(s.items[1]?.type).toBe("action-chips");
    expect(s.items[1]?.chips).toContain("Format note");
  });

  it("adds user input", () => {
    const s = addUserInput(createInitialState(), "Customer says X");
    expect(s.items[0]?.type).toBe("user-input");
    expect(s.items[0]?.content).toBe("Customer says X");
  });

  it("adds result card with follow-up chips", () => {
    const s = addResultCard(createInitialState(), mockResult);
    const card = s.items.find((i) => i.type === "result-card");
    expect(card).toBeDefined();
    expect(card?.result?.result.formattedNote).toBe("Professional note.");
    const chips = s.items.find((i) => i.type === "action-chips");
    expect(chips?.chips).toContain("Copy formatted note");
    expect(chips?.chips).toContain("Format another");
  });

  it("adds warning card", () => {
    const s = addWarningCard(createInitialState(), "Dev Mode", "Mock active");
    expect(s.items[0]?.type).toBe("warning-card");
    expect(s.items[0]?.title).toBe("Dev Mode");
  });

  it("adds error card with recovery chips", () => {
    const s = addErrorCard(createInitialState(), "Failed", "Error", ["Try again", "Clear"]);
    expect(s.items[0]?.type).toBe("error-card");
    expect(s.items[1]?.type).toBe("action-chips");
    expect(s.items[1]?.chips).toContain("Try again");
  });

  it("adds and removes processing message", () => {
    let s = addProcessingMessage(createInitialState(), "Formatting…");
    expect(s.isProcessing).toBe(true);
    expect(s.items.some((i) => i.type === "processing")).toBe(true);
    s = removeProcessing(s);
    expect(s.isProcessing).toBe(false);
    expect(s.items.some((i) => i.type === "processing")).toBe(false);
  });

  it("clears conversation to empty state", () => {
    let s = addWelcomeMessage(createInitialState());
    s = addHelperMessage(s, "Hello");
    s = clearConversation(s);
    expect(s.items).toEqual([]);
  });

  it("sets pending note and active intent", () => {
    let s = setPendingNote(createInitialState(), "test note");
    expect(s.pendingNote).toBe("test note");
    s = setActiveIntent(s, "format_technician_note");
    expect(s.activeIntent).toBe("format_technician_note");
  });
});
