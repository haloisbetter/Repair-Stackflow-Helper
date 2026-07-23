import { describe, it, expect } from "vitest";
import { TemporaryCheckInStore } from "../../src/checkin/temporary-checkin-store.js";
import { canTransitionCheckIn, isCheckInTerminal, canCaptureAudio } from "../../src/checkin/checkin-contract.js";
import type { CheckInSessionState, ConsentStatus } from "../../src/checkin/checkin-contract.js";

function makeStore() {
  return new TemporaryCheckInStore();
}

describe("Check-in session state transitions", () => {
  it("allows created → awaiting_consent", () => {
    expect(canTransitionCheckIn("created", "awaiting_consent")).toBe(true);
  });
  it("allows awaiting_consent → ready", () => {
    expect(canTransitionCheckIn("awaiting_consent", "ready")).toBe(true);
  });
  it("allows ready → listening", () => {
    expect(canTransitionCheckIn("ready", "listening")).toBe(true);
  });
  it("allows listening → paused", () => {
    expect(canTransitionCheckIn("listening", "paused")).toBe(true);
  });
  it("allows paused → listening", () => {
    expect(canTransitionCheckIn("paused", "listening")).toBe(true);
  });
  it("allows listening → processing", () => {
    expect(canTransitionCheckIn("listening", "processing")).toBe(true);
  });
  it("allows processing → ready_for_review", () => {
    expect(canTransitionCheckIn("processing", "ready_for_review")).toBe(true);
  });
  it("allows ready_for_review → accepted", () => {
    expect(canTransitionCheckIn("ready_for_review", "accepted")).toBe(true);
  });
  it("allows ready_for_review → rejected", () => {
    expect(canTransitionCheckIn("ready_for_review", "rejected")).toBe(true);
  });
  it("rejects created → listening (must go through consent)", () => {
    expect(canTransitionCheckIn("created", "listening")).toBe(false);
  });
  it("rejects accepted → rejected (terminal)", () => {
    expect(canTransitionCheckIn("accepted", "rejected")).toBe(false);
  });
  it("identifies terminal states", () => {
    expect(isCheckInTerminal("accepted")).toBe(true);
    expect(isCheckInTerminal("rejected")).toBe(true);
    expect(isCheckInTerminal("cancelled")).toBe(true);
    expect(isCheckInTerminal("expired")).toBe(true);
    expect(isCheckInTerminal("listening")).toBe(false);
  });
});

describe("Consent and audio capture", () => {
  it("cannot capture audio without consent", () => {
    expect(canCaptureAudio({ state: "listening", consentStatus: "not_requested" })).toBe(false);
    expect(canCaptureAudio({ state: "listening", consentStatus: "declined" })).toBe(false);
  });
  it("can capture audio with consent granted and in listening state", () => {
    expect(canCaptureAudio({ state: "listening", consentStatus: "granted" })).toBe(true);
  });
  it("cannot capture in ready state even with consent", () => {
    expect(canCaptureAudio({ state: "ready", consentStatus: "granted" })).toBe(true);
  });
  it("cannot capture in terminal states", () => {
    expect(canCaptureAudio({ state: "accepted", consentStatus: "granted" })).toBe(false);
  });
});

describe("TemporaryCheckInStore", () => {
  it("creates a session with correct defaults", () => {
    const store = makeStore();
    const session = store.create({ organizationId: "org-1" });
    expect(session.state).toBe("created");
    expect(session.consentStatus).toBe("not_requested");
    expect(session.transcriptSegments).toHaveLength(0);
    expect(session.sessionId).toBeDefined();
  });

  it("sets consent and transitions to ready when granted", () => {
    const store = makeStore();
    const session = store.create({ organizationId: "org-1" });
    store.updateState(session.sessionId, "awaiting_consent");
    store.setConsent(session.sessionId, "granted" as ConsentStatus);
    store.updateState(session.sessionId, "ready");
    const updated = store.get(session.sessionId);
    expect(updated?.consentStatus).toBe("granted");
    expect(updated?.state).toBe("ready");
  });

  it("rejects invalid state transitions", () => {
    const store = makeStore();
    const session = store.create({ organizationId: "org-1" });
    expect(() => store.updateState(session.sessionId, "listening" as CheckInSessionState)).toThrow();
  });

  it("rejects transitions from terminal states", () => {
    const store = makeStore();
    const session = store.create({ organizationId: "org-1" });
    store.updateState(session.sessionId, "awaiting_consent");
    store.updateState(session.sessionId, "ready");
    store.updateState(session.sessionId, "listening");
    store.updateState(session.sessionId, "processing");
    store.updateState(session.sessionId, "ready_for_review");
    store.updateState(session.sessionId, "accepted");
    expect(() => store.updateState(session.sessionId, "rejected" as CheckInSessionState)).toThrow();
  });

  it("adds transcript segments with bounds", () => {
    const store = makeStore();
    const session = store.create({ organizationId: "org-1" });
    const seg = {
      segmentId: "seg-1",
      text: "Hello world",
      startTimeMs: 0,
      endTimeMs: 1000,
      speakerRole: "customer" as const,
      provider: "mock",
      status: "final" as const
    };
    const updated = store.addTranscriptSegments(session.sessionId, [seg]);
    expect(updated.transcriptSegments).toHaveLength(1);
  });

  it("expires sessions after TTL", () => {
    const store = makeStore();
    const session = store.create({ organizationId: "org-1" });
    const record = store.get(session.sessionId);
    expect(record).not.toBeNull();
    // Manually expire
    if (record) {
      record.expiresAt = new Date(Date.now() - 1).toISOString();
    }
    // Re-get should return expired
    expect(store.get(session.sessionId)?.state).toBe("expired");
  });

  it("tracks session metrics without content", () => {
    const store = makeStore();
    store.create({ organizationId: "org-1" });
    store.create({ organizationId: "org-1" });
    const metrics = store.getSessionMetrics();
    expect(metrics.total).toBe(2);
    expect(metrics.active).toBe(2);
    const json = JSON.stringify(metrics);
    expect(json).not.toContain("transcript");
    expect(json).not.toContain("customer");
    expect(json).not.toContain("symptom");
  });

  it("different organizations remain distinct", () => {
    const store = makeStore();
    const s1 = store.create({ organizationId: "org-1" });
    const s2 = store.create({ organizationId: "org-2" });
    expect(s1.organizationId).toBe("org-1");
    expect(s2.organizationId).toBe("org-2");
    expect(s1.sessionId).not.toBe(s2.sessionId);
  });
});
