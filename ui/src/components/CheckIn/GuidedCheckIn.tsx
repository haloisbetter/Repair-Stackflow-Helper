import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../app/api-client.js";
import { useMicrophone, type MicState } from "./useMicrophone.js";

export interface CheckInSessionInfo {
  sessionId: string;
  state: string;
  customerName: string | null;
}

interface TranscriptSegmentView {
  segmentId: string;
  text: string;
  speakerRole: string;
  status: string;
  startTimeMs: number;
  provider: string;
}

interface ExtractedFieldView {
  field: string;
  value: unknown;
  confidence: string;
  employeeConfirmed: boolean;
  sourceSegmentIds: string[];
}

interface FieldConflictView {
  field: string;
  values: unknown[];
  resolution: string;
  overrideReason: string | null;
}

interface SymptomSummary {
  symptomSummary: string;
  primaryIssue: string;
  uncertainties: string[];
  warnings: string[];
}

type CollapsibleSection = "recording" | "customer-device" | "issue-intake" | "review";
type CheckInView = "start" | "workspace" | "final-review";

const DEVICE_TYPES = ["Mac", "Windows PC", "iPhone", "iPad", "Android", "Gaming console", "Other"];
const ISSUE_TYPES = ["No power", "Slow", "Won't boot", "Broken screen", "Liquid damage", "Data recovery", "Battery issue", "Charging issue", "Software issue", "Virus or scam", "Other"];
const ACCESSORIES = ["Charger", "Power adapter", "Cable", "Case", "Bag", "External drive", "Other", "Device only"];
const CONTACT_METHODS = ["Call", "Text", "Email"];
const QUICK_QUESTIONS = [
  "When did this start?",
  "Does it happen every time?",
  "What happened immediately before it started?",
  "What have you already tried?",
  "Is your data backed up?",
  "Was there any liquid exposure?",
  "Has anyone repaired it before?",
  "Did you bring the charger?",
  "Is Find My turned off?",
];

export function GuidedCheckIn({
  onClose,
  onSessionChange,
  onRecordingChange,
}: {
  onClose: () => void;
  onSessionChange?: (info: CheckInSessionInfo | null) => void;
  onRecordingChange?: (recording: boolean) => void;
}) {
  const [session, setSession] = useState<CheckInSessionInfo | null>(null);
  const [fullSession, setFullSession] = useState<FullSessionData | null>(null);
  const [view, setView] = useState<CheckInView>("start");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerHealth, setProviderHealth] = useState<{ status: string; providerName: string; isLocal: boolean } | null>(null);
  const [summary, setSummary] = useState<SymptomSummary | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [editingSummary, setEditingSummary] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<CollapsibleSection, boolean>>({
    recording: true,
    "customer-device": true,
    "issue-intake": true,
    review: false,
  });
  const [quickFields, setQuickFields] = useState<Record<string, string>>({});
  const [accessories, setAccessories] = useState<Record<string, boolean>>({});
  const [accessoryNotes, setAccessoryNotes] = useState<Record<string, string>>({});
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [manualTranscript, setManualTranscript] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const sessionIdRef = useRef<string | null>(null);

  // ── Microphone hook ──
  const sendAudioChunk = useCallback(async (blob: Blob) => {
    if (!sessionIdRef.current) return;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      await fetch(`/api/v1/checkin/sessions/${sessionIdRef.current}/transcript/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: arrayBuffer,
      });
      await refreshSession(sessionIdRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audio transcription failed");
    }
  }, []);

  const handleMicStateChange = useCallback((state: MicState) => {
    onRecordingChange?.(state === "listening");
  }, [onRecordingChange]);

  const mic = useMicrophone({
    onAudioChunk: sendAudioChunk,
    onStateChange: handleMicStateChange,
  });

  // ── Session management ──
  const refreshSession = useCallback(async (sid: string) => {
    try {
      const s = await api.request<FullSessionData>(`/api/v1/checkin/sessions/${sid}`);
      setFullSession(s);
      const customerName = s.extractedFields.find(
        (f) => f.field === "customerName" || f.field === "firstName"
      );
      setSession({
        sessionId: sid,
        state: s.state,
        customerName: customerName ? String(customerName.value) : null,
      });
    } catch {
      // Session may have expired
    }
  }, []);

  useEffect(() => {
    onSessionChange?.(session);
  }, [session, onSessionChange]);

  const startSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.request<{ sessionId: string }>("/api/v1/checkin/sessions", { method: "POST" });
      sessionIdRef.current = res.sessionId;
      await refreshSession(res.sessionId);
      setView("workspace");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start session");
    } finally {
      setLoading(false);
    }
  }, [refreshSession]);

  const grantConsent = useCallback(async () => {
    if (!sessionIdRef.current) return;
    setLoading(true);
    try {
      await api.request(`/api/v1/checkin/sessions/${sessionIdRef.current}/consent`, {
        method: "POST",
        body: JSON.stringify({ consentStatus: "granted" }),
      });
      await refreshSession(sessionIdRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record consent");
    } finally {
      setLoading(false);
    }
  }, [refreshSession]);

  const declineConsent = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      await api.request(`/api/v1/checkin/sessions/${sessionIdRef.current}/consent`, {
        method: "POST",
        body: JSON.stringify({ consentStatus: "declined" }),
      });
      await refreshSession(sessionIdRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }, [refreshSession]);

  const startCapture = useCallback(async () => {
    if (!sessionIdRef.current) return;
    setLoading(true);
    try {
      await api.request(`/api/v1/checkin/sessions/${sessionIdRef.current}/capture/start`, { method: "POST" });
      await refreshSession(sessionIdRef.current);
      await mic.startRecording();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start capture");
    } finally {
      setLoading(false);
    }
  }, [refreshSession, mic]);

  const pauseCapture = useCallback(async () => {
    if (!sessionIdRef.current) return;
    mic.pauseRecording();
    try {
      await api.request(`/api/v1/checkin/sessions/${sessionIdRef.current}/capture/pause`, { method: "POST" });
      await refreshSession(sessionIdRef.current);
    } catch {
      // Non-fatal
    }
  }, [refreshSession, mic]);

  const resumeCapture = useCallback(async () => {
    if (!sessionIdRef.current) return;
    mic.resumeRecording();
    try {
      await api.request(`/api/v1/checkin/sessions/${sessionIdRef.current}/capture/resume`, { method: "POST" });
      await refreshSession(sessionIdRef.current);
    } catch {
      // Non-fatal
    }
  }, [refreshSession, mic]);

  const stopCapture = useCallback(async () => {
    if (!sessionIdRef.current) return;
    mic.stopRecording();
    try {
      await api.request(`/api/v1/checkin/sessions/${sessionIdRef.current}/capture/stop`, { method: "POST" });
      await refreshSession(sessionIdRef.current);
    } catch {
      // Non-fatal
    }
  }, [refreshSession, mic]);

  const addMockTranscript = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      await api.request(`/api/v1/checkin/sessions/${sessionIdRef.current}/transcript/mock`, { method: "POST" });
      await refreshSession(sessionIdRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }, [refreshSession]);

  const addManualNote = useCallback(async () => {
    if (!sessionIdRef.current || !manualTranscript.trim()) return;
    try {
      await api.request(`/api/v1/checkin/sessions/${sessionIdRef.current}/transcript/manual`, {
        method: "POST",
        body: JSON.stringify({ text: manualTranscript.trim(), speakerRole: "employee" }),
      });
      setManualTranscript("");
      await refreshSession(sessionIdRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add note");
    }
  }, [refreshSession, manualTranscript]);

  const extractFields = useCallback(async () => {
    if (!sessionIdRef.current) return;
    setLoading(true);
    try {
      await api.request(`/api/v1/checkin/sessions/${sessionIdRef.current}/extract`, { method: "POST" });
      await refreshSession(sessionIdRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  }, [refreshSession]);

  const updateFields = useCallback(async (fields: Record<string, unknown>) => {
    if (!sessionIdRef.current) return;
    try {
      await api.request(`/api/v1/checkin/sessions/${sessionIdRef.current}/fields`, {
        method: "PUT",
        body: JSON.stringify(fields),
      });
      await refreshSession(sessionIdRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update fields");
    }
  }, [refreshSession]);

  const generateSummary = useCallback(async () => {
    if (!sessionIdRef.current) return;
    setLoading(true);
    try {
      const s = await api.request<SymptomSummary>(
        `/api/v1/checkin/sessions/${sessionIdRef.current}/summarize`,
        { method: "POST" }
      );
      setSummary(s);
      setSummaryDraft(s.symptomSummary);
      await refreshSession(sessionIdRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate summary");
    } finally {
      setLoading(false);
    }
  }, [refreshSession]);

  const acceptReview = useCallback(async (override?: string) => {
    if (!sessionIdRef.current) return;
    setLoading(true);
    try {
      await api.request(`/api/v1/checkin/sessions/${sessionIdRef.current}/review`, {
        method: "POST",
        body: JSON.stringify({ reviewStatus: "accepted", overrideReason: override }),
      });
      await refreshSession(sessionIdRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to accept");
    } finally {
      setLoading(false);
    }
  }, [refreshSession]);

  const rejectReview = useCallback(async () => {
    if (!sessionIdRef.current) return;
    setLoading(true);
    try {
      await api.request(`/api/v1/checkin/sessions/${sessionIdRef.current}/review`, {
        method: "POST",
        body: JSON.stringify({ reviewStatus: "rejected" }),
      });
      await refreshSession(sessionIdRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setLoading(false);
    }
  }, [refreshSession]);

  const cancelSession = useCallback(async () => {
    if (!sessionIdRef.current) return;
    mic.stopRecording();
    try {
      await api.request(`/api/v1/checkin/sessions/${sessionIdRef.current}/cancel`, { method: "POST" });
      sessionIdRef.current = null;
      setSession(null);
      setFullSession(null);
      setSummary(null);
      setView("start");
    } catch {
      // ignore
    }
  }, [mic]);

  const copySummary = useCallback(() => {
    const text = summaryDraft || summary?.symptomSummary || "";
    if (text) navigator.clipboard.writeText(text).catch(() => {});
  }, [summaryDraft, summary]);

  // ── Provider health ──
  useEffect(() => {
    api.request<{ status: string; providerName: string; isLocal: boolean }>("/api/v1/checkin/transcription/health")
      .then((h) => setProviderHealth(h))
      .catch(() => setProviderHealth({ status: "unavailable", providerName: "unknown", isLocal: false }));
  }, []);

  // ── Derived state ──
  const consentStatus = fullSession?.consentStatus ?? "not_requested";
  const sessionState = fullSession?.state ?? "created";
  const segments = fullSession?.transcriptSegments ?? [];
  const fields = fullSession?.extractedFields ?? [];
  const conflicts = fullSession?.fieldConflicts ?? [];
  const missingFields = fullSession?.missingFields ?? [];
  const hasUnresolvedConflicts = conflicts.some((c) => c.resolution === "unresolved");
  const requiredFieldsCount = 16;
  const completedRequired = requiredFieldsCount - missingFields.length;
  const isMock = providerHealth?.providerName === "mock";
  const isRecording = mic.micState === "listening";
  const isPaused = mic.micState === "paused";
  const canAccept = !hasUnresolvedConflicts || (showOverride && overrideReason.trim().length > 0);

  const toggleSection = useCallback((s: CollapsibleSection) => {
    setExpandedSections((prev) => ({ ...prev, [s]: !prev[s] }));
  }, []);

  const handleQuickField = useCallback((field: string, value: string) => {
    setQuickFields((prev) => ({ ...prev, [field]: value }));
    void updateFields({ [field]: value, _employeeConfirmed: true });
  }, [updateFields]);

  const handleAccessoryToggle = useCallback((name: string) => {
    setAccessories((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      const selected = ACCESSORIES.filter((a) => next[a]);
      void updateFields({ accessoriesReceived: selected });
      return next;
    });
  }, [updateFields]);

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Render: Start screen ──
  if (view === "start" && !session) {
    return (
      <div className="checkin-view" role="dialog" aria-label="Guided Check-In">
        <div className="checkin-start-screen">
          <div className="checkin-start-hero">
            <h2>Guided Check-In</h2>
            <p>Walk a customer through a structured device intake conversation. Capture audio with consent, extract key fields automatically, and review before submitting.</p>
          </div>
          <div className="checkin-start-actions">
            <button className="checkin-primary-btn" onClick={startSession} disabled={loading}>
              Start New Check-In
            </button>
            <button className="checkin-secondary-btn" onClick={() => { void startSession(); }}>
              Continue Manually
            </button>
          </div>
          <div className="checkin-provider-status">
            <h3>Microphone & Transcription</h3>
            <div className="provider-status-row">
              <span className="provider-label">Provider:</span>
              <span className={`provider-value ${providerHealth?.status === "available" ? "ok" : "warn"}`}>
                {providerHealth?.providerName ?? "checking…"}
              </span>
              {isMock && <span className="mock-badge" title="Mock transcription is active">MOCK</span>}
            </div>
            <div className="provider-status-row">
              <span className="provider-label">Status:</span>
              <span className="provider-value">{providerHealth?.status ?? "unknown"}</span>
            </div>
            <div className="provider-status-row">
              <span className="provider-label">Type:</span>
              <span className="provider-value">{providerHealth?.isLocal ? "Local (on-device)" : "Unknown"}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Workspace ──
  return (
    <div className="checkin-view" role="dialog" aria-label="Guided Check-In">
      {error && <div className="checkin-error" role="alert">{error}</div>}

      {/* Session status bar */}
      <div className="checkin-status-bar">
        <span className={`status-badge status-${sessionState}`}>{sessionState}</span>
        <span className={`consent-badge consent-${consentStatus}`}>Consent: {consentStatus}</span>
        {providerHealth && (
          <span className="provider-badge" title="Transcription provider">
            {providerHealth.providerName}
            {isMock && <span className="mock-badge-inline"> MOCK</span>}
          </span>
        )}
        <button className="checkin-cancel-btn" onClick={() => setConfirmCancel(true)}>Cancel Session</button>
      </div>

      {/* ── Section 1: Recording ── */}
      <div className={`checkin-section ${expandedSections.recording ? "expanded" : "collapsed"}`}>
        <button className="section-header" onClick={() => toggleSection("recording")}>
          <span className="section-chevron">{expandedSections.recording ? "▼" : "▶"}</span>
          <span className="section-title">Listening & Transcript</span>
          {isRecording && <span className="recording-dot" />}
        </button>
        {expandedSections.recording && (
          <div className="section-body">
            {/* Consent gate */}
            {consentStatus === "not_requested" && (
              <div className="consent-card">
                <p className="consent-message">Customer consent is required before microphone capture. Explain that audio will be used to assist with check-in.</p>
                <div className="consent-buttons">
                  <button className="checkin-primary-btn" onClick={grantConsent} disabled={loading}>Grant Consent</button>
                  <button className="checkin-secondary-btn" onClick={declineConsent}>Declined</button>
                  <button className="checkin-secondary-btn" onClick={() => setView("workspace")}>Continue Manually</button>
                </div>
              </div>
            )}

            {/* Recording controls */}
            {consentStatus === "granted" && (
              <div className="recording-card">
                {mic.micError && (
                  <div className="mic-error" role="alert">
                    <strong>{mic.micError.code}:</strong> {mic.micError.message}
                    <button className="mic-error-dismiss" onClick={mic.clearError}>Dismiss</button>
                  </div>
                )}

                {mic.micState === "idle" && (sessionState === "ready" || sessionState === "paused") && (
                  <button className="mic-start-btn" onClick={startCapture} disabled={loading}>
                    <span className="mic-icon" aria-hidden="true">🎤</span>
                    Start Listening
                  </button>
                )}

                {isRecording && (
                  <div className="recording-active">
                    <div className="recording-indicator-large">
                      <span className="recording-pulse" />
                      <span className="recording-label">Recording</span>
                      <span className="recording-time">{formatElapsed(mic.elapsedSec)}</span>
                    </div>
                    {mic.audioLevel > 0 && (
                      <div className="audio-level-bar" aria-hidden="true">
                        <div className="audio-level-fill" style={{ width: `${Math.round(mic.audioLevel * 100)}%` }} />
                      </div>
                    )}
                    {mic.inputDevices.length > 0 && (
                      <select
                        className="mic-device-select"
                        value={mic.selectedDeviceId ?? ""}
                        onChange={(e) => mic.setSelectedDeviceId(e.target.value || undefined)}
                        aria-label="Select microphone"
                      >
                        <option value="">Default microphone</option>
                        {mic.inputDevices.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 8)}`}</option>
                        ))}
                      </select>
                    )}
                    <div className="recording-controls">
                      <button className="recording-btn pause" onClick={pauseCapture}>Pause</button>
                      <button className="recording-btn stop" onClick={stopCapture}>Stop</button>
                    </div>
                  </div>
                )}

                {isPaused && (
                  <div className="recording-paused">
                    <span className="paused-label">Paused</span>
                    <span className="paused-time">{formatElapsed(mic.elapsedSec)}</span>
                    <div className="recording-controls">
                      <button className="recording-btn resume" onClick={resumeCapture}>Resume</button>
                      <button className="recording-btn stop" onClick={stopCapture}>Stop</button>
                    </div>
                  </div>
                )}

                {mic.micState === "idle" && sessionState !== "ready" && sessionState !== "paused" && segments.length > 0 && (
                  <div className="recording-stopped">
                    <button className="checkin-secondary-btn" onClick={startCapture}>Add More Conversation</button>
                    <button className="checkin-secondary-btn" onClick={extractFields} disabled={loading}>Process Conversation</button>
                  </div>
                )}

                {/* Mock transcript button (dev only) */}
                {isMock && (
                  <button className="checkin-mock-btn" onClick={addMockTranscript}>
                    Add Mock Transcript (Dev)
                  </button>
                )}
              </div>
            )}

            {/* Manual mode */}
            {consentStatus === "declined" && (
              <div className="manual-mode-banner" role="status">
                Manual mode — enter information using the quick-fire controls below.
              </div>
            )}

            {/* Transcript */}
            {segments.length > 0 && (
              <div className="transcript-list" role="log" aria-label="Transcript">
                {segments.map((seg) => (
                  <div key={seg.segmentId} className={`transcript-item ${seg.status}`}>
                    <span className="transcript-time">{formatMs(seg.startTimeMs)}</span>
                    <span className={`transcript-speaker speaker-${seg.speakerRole}`}>{seg.speakerRole}</span>
                    <span className="transcript-text">{seg.text}</span>
                    {seg.status === "interim" && <span className="interim-label">interim</span>}
                    {seg.provider === "mock" && <span className="mock-tag">mock</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Manual note input */}
            <div className="manual-note-row">
              <input
                type="text"
                className="manual-note-input"
                placeholder="Add a manual note…"
                value={manualTranscript}
                onChange={(e) => setManualTranscript(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void addManualNote(); }}
              />
              <button className="manual-note-btn" onClick={addManualNote} disabled={!manualTranscript.trim()}>Add</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 2: Customer & Device ── */}
      <div className={`checkin-section ${expandedSections["customer-device"] ? "expanded" : "collapsed"}`}>
        <button className="section-header" onClick={() => toggleSection("customer-device")}>
          <span className="section-chevron">{expandedSections["customer-device"] ? "▼" : "▶"}</span>
          <span className="section-title">Customer & Device</span>
        </button>
        {expandedSections["customer-device"] && (
          <div className="section-body">
            <div className="quick-field-group">
              <label className="quick-field-label">Customer type</label>
              <div className="segmented-row">
                {["New customer", "Existing customer"].map((opt) => (
                  <button
                    key={opt}
                    className={`seg-btn ${quickFields["customerType"] === opt ? "active" : ""}`}
                    onClick={() => handleQuickField("customerType", opt)}
                  >{opt}</button>
                ))}
              </div>
            </div>
            <div className="quick-field-grid">
              <div className="quick-field">
                <label>First name</label>
                <input type="text" value={quickFields["firstName"] ?? getFieldValue(fields, "firstName")}
                  onChange={(e) => handleQuickField("firstName", e.target.value)} />
              </div>
              <div className="quick-field">
                <label>Last name</label>
                <input type="text" value={quickFields["lastName"] ?? getFieldValue(fields, "lastName")}
                  onChange={(e) => handleQuickField("lastName", e.target.value)} />
              </div>
              <div className="quick-field">
                <label>Phone</label>
                <input type="tel" value={quickFields["phone"] ?? getFieldValue(fields, "phone")}
                  onChange={(e) => handleQuickField("phone", e.target.value)} />
              </div>
              <div className="quick-field">
                <label>Email</label>
                <input type="email" value={quickFields["email"] ?? getFieldValue(fields, "email")}
                  onChange={(e) => handleQuickField("email", e.target.value)} />
              </div>
            </div>
            <div className="quick-field-group">
              <label className="quick-field-label">Preferred contact</label>
              <div className="segmented-row">
                {CONTACT_METHODS.map((m) => (
                  <button key={m} className={`seg-btn ${quickFields["preferredContactMethod"] === m ? "active" : ""}`}
                    onClick={() => handleQuickField("preferredContactMethod", m)}>{m}</button>
                ))}
              </div>
            </div>

            <div className="quick-field-group">
              <label className="quick-field-label">Device type</label>
              <div className="segmented-row wrap">
                {DEVICE_TYPES.map((t) => (
                  <button key={t} className={`seg-btn ${quickFields["deviceCategory"] === t ? "active" : ""}`}
                    onClick={() => handleQuickField("deviceCategory", t)}>{t}</button>
                ))}
              </div>
            </div>
            <div className="quick-field-grid">
              <div className="quick-field">
                <label>Manufacturer</label>
                <input type="text" value={quickFields["manufacturer"] ?? getFieldValue(fields, "manufacturer")}
                  onChange={(e) => handleQuickField("manufacturer", e.target.value)} />
              </div>
              <div className="quick-field">
                <label>Model</label>
                <input type="text" value={quickFields["model"] ?? getFieldValue(fields, "model")}
                  onChange={(e) => handleQuickField("model", e.target.value)} />
              </div>
              <div className="quick-field">
                <label>Serial number</label>
                <input type="text" value={quickFields["serialNumber"] ?? getFieldValue(fields, "serialNumber")}
                  onChange={(e) => handleQuickField("serialNumber", e.target.value)} />
              </div>
              <div className="quick-field">
                <label>Color</label>
                <input type="text" value={quickFields["color"] ?? getFieldValue(fields, "color")}
                  onChange={(e) => handleQuickField("color", e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 3: Issue & Intake ── */}
      <div className={`checkin-section ${expandedSections["issue-intake"] ? "expanded" : "collapsed"}`}>
        <button className="section-header" onClick={() => toggleSection("issue-intake")}>
          <span className="section-chevron">{expandedSections["issue-intake"] ? "▼" : "▶"}</span>
          <span className="section-title">Issue & Intake Details</span>
        </button>
        {expandedSections["issue-intake"] && (
          <div className="section-body">
            <div className="quick-field-group">
              <label className="quick-field-label">Issue type</label>
              <div className="segmented-row wrap">
                {ISSUE_TYPES.map((t) => (
                  <button key={t} className={`seg-btn ${quickFields["issueType"] === t ? "active" : ""}`}
                    onClick={() => handleQuickField("issueType", t)}>{t}</button>
                ))}
              </div>
            </div>

            <div className="quick-field">
              <label>Detailed description</label>
              <textarea className="quick-textarea" rows={2}
                value={quickFields["reportedIssue"] ?? getFieldValue(fields, "reportedIssue")}
                onChange={(e) => handleQuickField("reportedIssue", e.target.value)} />
            </div>

            {/* Critical questions */}
            <div className="critical-questions">
              <SegControl label="Liquid exposure" options={["Yes", "No", "Unsure"]} field="liquidExposure" value={quickFields["liquidExposure"]} onChange={handleQuickField} />
              <SegControl label="Physical damage" options={["Yes", "No", "Unsure"]} field="physicalDamage" value={quickFields["physicalDamage"]} onChange={handleQuickField} />
              <SegControl label="Backed up" options={["Yes", "No", "Unsure"]} field="backupStatus" value={quickFields["backupStatus"]} onChange={handleQuickField} />
              <SegControl label="Device powers on" options={["Yes", "No", "Intermittent", "Unsure"]} field="powerState" value={quickFields["powerState"]} onChange={handleQuickField} />
              <SegControl label="Data important" options={["Critical", "Important", "Not important", "Unsure"]} field="dataImportance" value={quickFields["dataImportance"]} onChange={handleQuickField} />
              <SegControl label="Prior repair" options={["Yes", "No", "Unsure"]} field="priorRepair" value={quickFields["priorRepair"]} onChange={handleQuickField} />
              <SegControl label="Find My (Apple)" options={["Off", "On", "Unsure", "N/A"]} field="findMyStatus" value={quickFields["findMyStatus"]} onChange={handleQuickField} />
              <SegControl label="Passcode handling" options={["Customer will enter", "Secure flow", "Not available", "Not required"]} field="passcodeHandling" value={quickFields["passcodeHandling"]} onChange={handleQuickField} />
            </div>

            {/* Accessories */}
            <div className="quick-field-group">
              <label className="quick-field-label">Accessories received</label>
              <div className="accessory-grid">
                {ACCESSORIES.map((a) => (
                  <button key={a} className={`accessory-btn ${accessories[a] ? "active" : ""}`}
                    onClick={() => handleAccessoryToggle(a)}>{a}</button>
                ))}
              </div>
            </div>

            {/* Quick question prompts */}
            <div className="quick-questions">
              <label className="quick-field-label">Quick questions (employee prompts)</label>
              <div className="question-chips">
                {QUICK_QUESTIONS.map((q) => (
                  <button key={q} className="question-chip" onClick={() => setManualTranscript(q)}>{q}</button>
                ))}
              </div>
            </div>

            {/* Extracted fields display */}
            {fields.length > 0 && (
              <div className="extracted-fields-list">
                <h4>Extracted Fields</h4>
                {fields.map((f, i) => (
                  <div key={i} className="extracted-field-row">
                    <span className="ef-name">{f.field}</span>
                    <span className="ef-value">{String(f.value)}</span>
                    {f.employeeConfirmed ? (
                      <span className="ef-badge ef-confirmed">Employee confirmed</span>
                    ) : f.confidence === "inferred" ? (
                      <span className="ef-badge ef-inferred">AI inferred</span>
                    ) : f.confidence === "stated" ? (
                      <span className="ef-badge ef-stated">AI detected</span>
                    ) : f.confidence === "conflicting" ? (
                      <span className="ef-badge ef-conflict">Conflict</span>
                    ) : (
                      <span className="ef-badge ef-unknown">Needs confirmation</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Conflicts */}
            {conflicts.length > 0 && (
              <div className="conflicts-list" role="alert">
                <h4>Conflicts ({conflicts.length})</h4>
                {conflicts.map((c, i) => (
                  <div key={i} className="conflict-item">
                    <span className="conflict-field">{c.field}</span>
                    <span className="conflict-values">{c.values.map((v) => String(v)).join(" vs ")}</span>
                    <span className={`conflict-resolution res-${c.resolution}`}>{c.resolution}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Missing fields */}
            {missingFields.length > 0 && (
              <div className="missing-fields-list">
                <h4>Missing Information ({missingFields.length})</h4>
                <ul>
                  {missingFields.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}

            <button className="checkin-secondary-btn" onClick={extractFields} disabled={loading || segments.length === 0}>
              Re-extract Fields
            </button>
          </div>
        )}
      </div>

      {/* ── Readiness Panel ── */}
      <div className="readiness-panel">
        <div className="readiness-row">
          <span className="readiness-label">Required fields:</span>
          <span className="readiness-value">{completedRequired}/{requiredFieldsCount}</span>
        </div>
        <div className="readiness-row">
          <span className="readiness-label">Missing:</span>
          <span className="readiness-value">{missingFields.length}</span>
        </div>
        <div className="readiness-row">
          <span className="readiness-label">Unresolved conflicts:</span>
          <span className="readiness-value">{conflicts.filter((c) => c.resolution === "unresolved").length}</span>
        </div>
        <div className="readiness-row">
          <span className="readiness-label">Consent:</span>
          <span className="readiness-value">{consentStatus}</span>
        </div>
        <div className="readiness-row">
          <span className="readiness-label">Transcript:</span>
          <span className="readiness-value">{segments.length} segments</span>
        </div>
        <div className="readiness-row">
          <span className="readiness-label">Summary:</span>
          <span className="readiness-value">{summary ? "Generated" : "Not generated"}</span>
        </div>
        <div className={`readiness-status ${missingFields.length === 0 && !hasUnresolvedConflicts ? "ready" : hasUnresolvedConflicts ? "blocked" : "needs-info"}`}>
          {missingFields.length === 0 && !hasUnresolvedConflicts ? "Ready for Review" : hasUnresolvedConflicts ? "Blocked by Conflict" : "Needs Information"}
        </div>
      </div>

      {/* ── Section 4: Review ── */}
      <div className={`checkin-section ${expandedSections.review ? "expanded" : "collapsed"}`}>
        <button className="section-header" onClick={() => toggleSection("review")}>
          <span className="section-chevron">{expandedSections.review ? "▼" : "▶"}</span>
          <span className="section-title">Review & Symptom Summary</span>
        </button>
        {expandedSections.review && (
          <div className="section-body">
            {/* Symptom summary */}
            <div className="symptom-summary-panel">
              <div className="summary-header">
                <h4>Symptom Summary</h4>
                <div className="summary-btns">
                  <button className="sm-btn" onClick={generateSummary} disabled={loading}>Generate</button>
                  <button className="sm-btn" onClick={generateSummary} disabled={loading || !summary}>Regenerate</button>
                  <button className="sm-btn" onClick={() => setEditingSummary(!editingSummary)}>{editingSummary ? "Done" : "Edit"}</button>
                  <button className="sm-btn" onClick={copySummary}>Copy</button>
                </div>
              </div>
              {editingSummary ? (
                <textarea className="summary-edit" rows={4} value={summaryDraft}
                  onChange={(e) => setSummaryDraft(e.target.value)} />
              ) : (
                <div className="summary-display">
                  {summaryDraft || summary?.symptomSummary || "No summary generated yet. Click Generate or write one manually."}
                </div>
              )}
              {summary?.warnings && summary.warnings.length > 0 && (
                <div className="summary-warnings" role="alert">
                  {summary.warnings.map((w, i) => <div key={i}>{w}</div>)}
                </div>
              )}
              {summary?.uncertainties && summary.uncertainties.length > 0 && (
                <div className="summary-uncertainties">
                  <strong>Uncertainties:</strong>
                  <ul>{summary.uncertainties.map((u, i) => <li key={i}>{u}</li>)}</ul>
                </div>
              )}
            </div>

            {/* Go to final review */}
            <button className="checkin-primary-btn" onClick={() => setView("final-review")} disabled={loading}>
              Go to Final Review
            </button>
          </div>
        )}
      </div>

      {/* ── Final Review View ── */}
      {view === "final-review" && fullSession && (
        <FinalReview
          fullSession={fullSession}
          summary={summaryDraft || summary?.symptomSummary || ""}
          quickFields={quickFields}
          accessories={accessories}
          accessoryNotes={accessoryNotes}
          isMock={isMock}
          providerName={providerHealth?.providerName ?? "unknown"}
          hasUnresolvedConflicts={hasUnresolvedConflicts}
          showOverride={showOverride}
          overrideReason={overrideReason}
          setOverrideReason={setOverrideReason}
          setShowOverride={setShowOverride}
          onAccept={() => void acceptReview(showOverride ? overrideReason : undefined)}
          onEditAccept={() => { setView("workspace"); setExpandedSections((p) => ({ ...p, "customer-device": true })); }}
          onReturn={() => setView("workspace")}
          onReject={() => void rejectReview()}
          onCopy={copySummary}
          onCancel={() => setConfirmCancel(true)}
          loading={loading}
          canAccept={canAccept}
        />
      )}

      {/* Cancel confirmation */}
      {confirmCancel && (
        <div className="checkin-modal-overlay" role="dialog" aria-label="Cancel session?">
          <div className="checkin-confirm-modal">
            <p>Cancel this check-in session? All entered information will be lost.</p>
            <div className="confirm-btns">
              <button className="checkin-danger-btn" onClick={() => { void cancelSession(); setConfirmCancel(false); }}>Yes, Cancel</button>
              <button className="checkin-secondary-btn" onClick={() => setConfirmCancel(false)}>Keep Session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Final Review sub-component ──
function FinalReview(props: {
  fullSession: FullSessionData;
  summary: string;
  quickFields: Record<string, string>;
  accessories: Record<string, boolean>;
  accessoryNotes: Record<string, string>;
  isMock: boolean;
  providerName: string;
  hasUnresolvedConflicts: boolean;
  showOverride: boolean;
  overrideReason: string;
  setOverrideReason: (v: string) => void;
  setShowOverride: (v: boolean) => void;
  onAccept: () => void;
  onEditAccept: () => void;
  onReturn: () => void;
  onReject: () => void;
  onCopy: () => void;
  onCancel: () => void;
  loading: boolean;
  canAccept: boolean;
}) {
  const f = props.fullSession;
  const selectedAccessories = ACCESSORIES.filter((a) => props.accessories[a]);

  return (
    <div className="final-review-view" role="dialog" aria-label="Final check-in review">
      <div className="final-review-header">
        <h3>Final Review</h3>
        <button className="checkin-secondary-btn" onClick={props.onReturn}>← Back to Intake</button>
      </div>

      <div className="final-review-body">
        <ReviewSection title="Customer">
          <ReviewRow label="Name" value={`${props.quickFields["firstName"] ?? ""} ${props.quickFields["lastName"] ?? ""}`.trim() || getFieldValue(f.extractedFields, "customerName")} />
          <ReviewRow label="Phone" value={props.quickFields["phone"] ?? getFieldValue(f.extractedFields, "phone")} />
          <ReviewRow label="Email" value={props.quickFields["email"] ?? getFieldValue(f.extractedFields, "email")} />
          <ReviewRow label="Preferred contact" value={props.quickFields["preferredContactMethod"] ?? getFieldValue(f.extractedFields, "preferredContactMethod")} />
        </ReviewSection>

        <ReviewSection title="Device">
          <ReviewRow label="Category" value={props.quickFields["deviceCategory"] ?? getFieldValue(f.extractedFields, "deviceCategory")} />
          <ReviewRow label="Manufacturer" value={props.quickFields["manufacturer"] ?? getFieldValue(f.extractedFields, "manufacturer")} />
          <ReviewRow label="Model" value={props.quickFields["model"] ?? getFieldValue(f.extractedFields, "model")} />
          <ReviewRow label="Serial" value={props.quickFields["serialNumber"] ?? getFieldValue(f.extractedFields, "serialNumber")} />
          <ReviewRow label="Color" value={props.quickFields["color"] ?? getFieldValue(f.extractedFields, "color")} />
        </ReviewSection>

        <ReviewSection title="Intake">
          <ReviewRow label="Reported issue" value={props.quickFields["reportedIssue"] ?? getFieldValue(f.extractedFields, "reportedIssue")} />
          <ReviewRow label="Issue type" value={props.quickFields["issueType"] ?? ""} />
          <ReviewRow label="Liquid exposure" value={props.quickFields["liquidExposure"] ?? ""} />
          <ReviewRow label="Physical damage" value={props.quickFields["physicalDamage"] ?? ""} />
          <ReviewRow label="Power state" value={props.quickFields["powerState"] ?? ""} />
          <ReviewRow label="Backup" value={props.quickFields["backupStatus"] ?? ""} />
          <ReviewRow label="Data importance" value={props.quickFields["dataImportance"] ?? ""} />
          <ReviewRow label="Accessories" value={selectedAccessories.length > 0 ? selectedAccessories.join(", ") : "None"} />
          <ReviewRow label="Find My" value={props.quickFields["findMyStatus"] ?? ""} />
          <ReviewRow label="Passcode handling" value={props.quickFields["passcodeHandling"] ?? ""} />
        </ReviewSection>

        <ReviewSection title="Review">
          <ReviewRow label="Symptom summary" value={props.summary || "Not generated"} />
          <ReviewRow label="Missing fields" value={f.missingFields.length > 0 ? f.missingFields.join(", ") : "None"} />
          <ReviewRow label="Conflicts" value={f.fieldConflicts.length > 0 ? `${f.fieldConflicts.length} (${f.fieldConflicts.filter((c) => c.resolution === "unresolved").length} unresolved)` : "None"} />
          <ReviewRow label="Consent" value={f.consentStatus} />
          <ReviewRow label="Provider" value={props.providerName} />
          {props.isMock && <ReviewRow label="Mock status" value="Development mock data" />}
        </ReviewSection>

        {props.hasUnresolvedConflicts && !props.showOverride && (
          <div className="override-notice" role="alert">
            Unresolved conflicts prevent acceptance. <button className="link-btn" onClick={() => props.setShowOverride(true)}>Override with reason</button>
          </div>
        )}
        {props.showOverride && (
          <div className="override-input">
            <label>Override reason (required):</label>
            <input type="text" value={props.overrideReason} onChange={(e) => props.setOverrideReason(e.target.value)}
              placeholder="Why are you accepting with unresolved conflicts?" />
          </div>
        )}

        <div className="final-review-actions">
          <button className="checkin-primary-btn" onClick={props.onAccept} disabled={props.loading || !props.canAccept}>
            Accept Check-In
          </button>
          <button className="checkin-secondary-btn" onClick={props.onEditAccept} disabled={props.loading}>Edit and Accept</button>
          <button className="checkin-secondary-btn" onClick={props.onReturn} disabled={props.loading}>Return to Intake</button>
          <button className="checkin-danger-btn" onClick={props.onReject} disabled={props.loading}>Reject</button>
          <button className="checkin-secondary-btn" onClick={props.onCopy}>Copy Manually</button>
          <button className="checkin-danger-btn" onClick={props.onCancel}>Cancel Session</button>
        </div>
      </div>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="review-section">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="review-row">
      <span className="review-label">{label}</span>
      <span className="review-value">{value || "—"}</span>
    </div>
  );
}

function SegControl({ label, options, field, value, onChange }: {
  label: string;
  options: string[];
  field: string;
  value: string | undefined;
  onChange: (field: string, value: string) => void;
}) {
  return (
    <div className="quick-field-group">
      <label className="quick-field-label">{label}</label>
      <div className="segmented-row wrap">
        {options.map((opt) => (
          <button key={opt} className={`seg-btn ${value === opt ? "active" : ""}`}
            onClick={() => onChange(field, opt)}>{opt}</button>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ──
function getFieldValue(fields: ExtractedFieldView[], name: string): string {
  const f = fields.find((f) => f.field === name);
  return f ? String(f.value) : "";
}

function formatMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Types ──
interface FullSessionData {
  sessionId: string;
  state: string;
  consentStatus: string;
  consentRecordedAt: string | null;
  transcriptSegments: TranscriptSegmentView[];
  extractedFields: ExtractedFieldView[];
  fieldConflicts: FieldConflictView[];
  missingFields: string[];
  reviewStatus: string | null;
  proposalId: string | null;
}
