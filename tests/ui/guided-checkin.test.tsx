import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import React from "react";

const { mockApi, mockMic } = vi.hoisted(() => ({
  mockApi: {
    request: vi.fn(),
    bootstrap: vi.fn(),
    selectProvider: vi.fn(),
  },
  mockMic: {
    micState: "idle" as string,
    micError: null as { code: string; message: string } | null,
    elapsedSec: 0,
    audioLevel: 0,
    inputDevices: [] as MediaDeviceInfo[],
    selectedDeviceId: undefined as string | undefined,
    setSelectedDeviceId: vi.fn(),
    startRecording: vi.fn(),
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    stopRecording: vi.fn(),
    stopAllTracks: vi.fn(),
    clearError: vi.fn(),
  },
}));

vi.mock("../../ui/src/app/api-client.js", () => ({ api: mockApi }));
vi.mock("../../ui/src/components/CheckIn/useMicrophone.js", () => ({
  useMicrophone: () => mockMic,
  MicState: "idle",
}));

import { GuidedCheckIn, type CheckInSessionInfo } from "../../ui/src/components/CheckIn/GuidedCheckIn.js";

function renderCheckIn(overrides?: {
  onSessionChange?: (info: CheckInSessionInfo | null) => void;
  onRecordingChange?: (r: boolean) => void;
}) {
  const onSessionChange = overrides?.onSessionChange ?? vi.fn();
  const onRecordingChange = overrides?.onRecordingChange ?? vi.fn();
  render(React.createElement(GuidedCheckIn, { onClose: vi.fn(), onSessionChange, onRecordingChange }));
}

function mockSessionFlow(sid: string, sessionState: string, consentStatus: string, extra?: Record<string, unknown>) {
  mockApi.request.mockImplementation((path: string) => {
    if (path === "/api/v1/checkin/transcription/health")
      return Promise.resolve({ status: "available", providerName: "mock", isLocal: false });
    if (path === "/api/v1/checkin/sessions")
      return Promise.resolve({ sessionId: sid });
    if (path.includes("/consent"))
      return Promise.resolve({});
    if (path.startsWith(`/api/v1/checkin/sessions/${sid}`)) {
      return Promise.resolve({
        sessionId: sid, state: sessionState, consentStatus,
        transcriptSegments: [], extractedFields: [], fieldConflicts: [],
        missingFields: [], reviewStatus: null, proposalId: null,
        ...extra,
      });
    }
    return Promise.resolve({});
  });
}

async function startSession(sid = "s1", state = "created", consent = "not_requested", extra?: Record<string, unknown>) {
  mockSessionFlow(sid, state, consent, extra);
  renderCheckIn();
  await fireEvent.click(screen.getByText("Start New Check-In"));
  await waitFor(() => expect(screen.getByText("Grant Consent")).toBeTruthy());
}

describe("GuidedCheckIn Start Screen", () => {
  beforeEach(() => { vi.clearAllMocks(); mockApi.request.mockReset(); mockMic.micState = "idle"; mockMic.micError = null; });
  afterEach(() => cleanup());

  it("shows start screen with Start New Check-In", () => {
    mockApi.request.mockResolvedValue({ status: "available", providerName: "mock", isLocal: false });
    renderCheckIn();
    expect(screen.getByText("Start New Check-In")).toBeTruthy();
    expect(screen.getByText("Continue Manually")).toBeTruthy();
  });

  it("shows provider health status section", () => {
    mockApi.request.mockResolvedValue({ status: "available", providerName: "mock", isLocal: false });
    renderCheckIn();
    expect(screen.getByText("Microphone & Transcription")).toBeTruthy();
  });

  it("calls onSessionChange with null initially", () => {
    const onSessionChange = vi.fn();
    mockApi.request.mockResolvedValue({ status: "available", providerName: "mock", isLocal: false });
    renderCheckIn({ onSessionChange });
    expect(onSessionChange).toHaveBeenCalledWith(null);
  });

  it("creates a session when Start New Check-In is clicked", async () => {
    await startSession();
  });

  it("shows MOCK badge when provider is mock", async () => {
    mockApi.request.mockResolvedValue({ status: "available", providerName: "mock", isLocal: false });
    renderCheckIn();
    await waitFor(() => expect(screen.getByText("MOCK")).toBeTruthy());
  });
});

describe("GuidedCheckIn Quick-Fire Controls", () => {
  beforeEach(() => { vi.clearAllMocks(); mockApi.request.mockReset(); mockMic.micState = "idle"; mockMic.micError = null; });
  afterEach(() => cleanup());

  it("shows device type quick buttons", async () => {
    await startSession();
    expect(screen.getByText("Mac")).toBeTruthy();
    expect(screen.getByText("Windows PC")).toBeTruthy();
    expect(screen.getByText("iPhone")).toBeTruthy();
    expect(screen.getByText("Android")).toBeTruthy();
  });

  it("shows issue type quick buttons", async () => {
    await startSession();
    // Section is expanded by default, no need to click
    await waitFor(() => expect(screen.getByText("No power")).toBeTruthy());
    expect(screen.getByText("Broken screen")).toBeTruthy();
    expect(screen.getByText("Liquid damage")).toBeTruthy();
  });

  it("shows critical question segmented controls", async () => {
    await startSession();
    await waitFor(() => expect(screen.getByText("Liquid exposure")).toBeTruthy());
    expect(screen.getByText("Physical damage")).toBeTruthy();
    expect(screen.getByText("Backed up")).toBeTruthy();
    expect(screen.getByText("Device powers on")).toBeTruthy();
    expect(screen.getByText("Data important")).toBeTruthy();
    expect(screen.getByText("Prior repair")).toBeTruthy();
    expect(screen.getByText("Find My (Apple)")).toBeTruthy();
    expect(screen.getByText("Passcode handling")).toBeTruthy();
  });

  it("shows accessories toggle controls", async () => {
    await startSession();
    await waitFor(() => expect(screen.getByText("Charger")).toBeTruthy());
    expect(screen.getByText("Power adapter")).toBeTruthy();
    expect(screen.getByText("Cable")).toBeTruthy();
    expect(screen.getByText("Device only")).toBeTruthy();
  });

  it("shows quick question prompt chips", async () => {
    await startSession();
    await waitFor(() => expect(screen.getByText("When did this start?")).toBeTruthy());
    expect(screen.getByText("Is your data backed up?")).toBeTruthy();
    expect(screen.getByText("Is Find My turned off?")).toBeTruthy();
  });

  it("shows preferred contact method buttons", async () => {
    await startSession();
    await waitFor(() => expect(screen.getByText("Preferred contact")).toBeTruthy());
    expect(screen.getByText("Call")).toBeTruthy();
    expect(screen.getByText("Text")).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();
  });

  it("shows customer type toggle", async () => {
    await startSession();
    expect(screen.getByText("New customer")).toBeTruthy();
    expect(screen.getByText("Existing customer")).toBeTruthy();
  });
});

describe("GuidedCheckIn Consent Gate", () => {
  beforeEach(() => { vi.clearAllMocks(); mockApi.request.mockReset(); mockMic.micState = "idle"; mockMic.micError = null; });
  afterEach(() => cleanup());

  it("requires consent before showing Start Listening", async () => {
    await startSession();
    expect(screen.getByText("Grant Consent")).toBeTruthy();
    expect(screen.queryByText("Start Listening")).toBeNull();
  });

  it("shows Start Listening after consent granted", async () => {
    let consent = "not_requested";
    mockApi.request.mockImplementation((path: string) => {
      if (path === "/api/v1/checkin/transcription/health")
        return Promise.resolve({ status: "available", providerName: "mock", isLocal: false });
      if (path === "/api/v1/checkin/sessions") return Promise.resolve({ sessionId: "c2" });
      if (path.includes("/consent")) { consent = "granted"; return Promise.resolve({}); }
      if (path.startsWith("/api/v1/checkin/sessions/c2")) {
        return Promise.resolve({
          sessionId: "c2", state: "ready", consentStatus: consent,
          transcriptSegments: [], extractedFields: [], fieldConflicts: [],
          missingFields: [], reviewStatus: null, proposalId: null,
        });
      }
      return Promise.resolve({});
    });
    renderCheckIn();
    await fireEvent.click(screen.getByText("Start New Check-In"));
    await waitFor(() => expect(screen.getByText("Grant Consent")).toBeTruthy());
    await fireEvent.click(screen.getByText("Grant Consent"));
    await waitFor(() => expect(screen.getByText("Start Listening")).toBeTruthy());
  });
});

describe("GuidedCheckIn Security", () => {
  beforeEach(() => { vi.clearAllMocks(); mockApi.request.mockReset(); mockMic.micState = "idle"; mockMic.micError = null; });
  afterEach(() => cleanup());

  it("does not show passcode text input fields", async () => {
    await startSession();
    await waitFor(() => expect(screen.getByText("Passcode handling")).toBeTruthy());
    expect(screen.getByText("Customer will enter")).toBeTruthy();
    expect(screen.getByText("Secure flow")).toBeTruthy();
    expect(screen.queryAllByPlaceholderText(/passcode/i).length).toBe(0);
  });

  it("does not expose transcript in session info to parent", async () => {
    const onSessionChange = vi.fn();
    mockApi.request.mockImplementation((path: string) => {
      if (path === "/api/v1/checkin/transcription/health")
        return Promise.resolve({ status: "available", providerName: "mock", isLocal: false });
      if (path === "/api/v1/checkin/sessions") return Promise.resolve({ sessionId: "p1" });
      if (path.startsWith("/api/v1/checkin/sessions/p1")) {
        return Promise.resolve({
          sessionId: "p1", state: "created", consentStatus: "not_requested",
          transcriptSegments: [{ segmentId: "s1", text: "secret", speakerRole: "customer", status: "final", startTimeMs: 0, provider: "mock" }],
          extractedFields: [{ field: "customerName", value: "John", confidence: "stated", employeeConfirmed: false, sourceSegmentIds: ["s1"] }],
          fieldConflicts: [], missingFields: [], reviewStatus: null, proposalId: null,
        });
      }
      return Promise.resolve({});
    });
    renderCheckIn({ onSessionChange });
    await fireEvent.click(screen.getByText("Start New Check-In"));
    await waitFor(() => expect(screen.getByText("Grant Consent")).toBeTruthy());
    const calls = onSessionChange.mock.calls;
    const last = calls[calls.length - 1]?.[0];
    if (last) {
      expect(last.transcriptSegments).toBeUndefined();
      expect(last.extractedFields).toBeUndefined();
    }
  });
});

describe("GuidedCheckIn Readiness Panel", () => {
  beforeEach(() => { vi.clearAllMocks(); mockApi.request.mockReset(); mockMic.micState = "idle"; mockMic.micError = null; });
  afterEach(() => cleanup());

  it("shows Needs Information when fields are missing", async () => {
    await startSession("r1", "needs_information", "granted", { missingFields: ["firstName", "lastName", "phone"] });
    await waitFor(() => expect(screen.getByText("Needs Information")).toBeTruthy());
  });
});

describe("GuidedCheckIn Microphone Errors", () => {
  beforeEach(() => { vi.clearAllMocks(); mockApi.request.mockReset(); });
  afterEach(() => cleanup());

  it("shows microphone error when micError is set", async () => {
    mockMic.micError = { code: "denied", message: "Microphone permission denied." };
    mockMic.micState = "error";
    let consent = "not_requested";
    mockApi.request.mockImplementation((path: string) => {
      if (path === "/api/v1/checkin/transcription/health")
        return Promise.resolve({ status: "available", providerName: "mock", isLocal: false });
      if (path === "/api/v1/checkin/sessions") return Promise.resolve({ sessionId: "m1" });
      if (path.includes("/consent")) { consent = "granted"; return Promise.resolve({}); }
      if (path.startsWith("/api/v1/checkin/sessions/m1")) {
        return Promise.resolve({
          sessionId: "m1", state: "ready", consentStatus: consent,
          transcriptSegments: [], extractedFields: [], fieldConflicts: [],
          missingFields: [], reviewStatus: null, proposalId: null,
        });
      }
      return Promise.resolve({});
    });
    renderCheckIn();
    await fireEvent.click(screen.getByText("Start New Check-In"));
    await waitFor(() => expect(screen.getByText("Grant Consent")).toBeTruthy());
    await fireEvent.click(screen.getByText("Grant Consent"));
    await waitFor(() => expect(screen.getByText(/Microphone permission denied/)).toBeTruthy());
  });
});
