import React, { useState, useEffect, useCallback } from "react";
import { api } from "../../app/api-client.js";

interface CheckInSession {
  sessionId: string;
  state: string;
  consentStatus: string;
  transcriptSegments: Array<{ segmentId: string; text: string; speakerRole: string; status: string }>;
  extractedFields: Array<{ field: string; value: unknown; confidence: string; employeeConfirmed: boolean }>;
  fieldConflicts: Array<{ field: string; values: unknown[]; resolution: string }>;
  missingFields: string[];
  symptomSummaryProposal: Record<string, unknown> | null;
  reviewStatus: string | null;
}

interface SymptomSummary {
  symptomSummary: string;
  primaryIssue: string;
  uncertainties: string[];
  warnings: string[];
}

export function GuidedCheckIn({ onClose }: { onClose: () => void }) {
  const [session, setSession] = useState<CheckInSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerHealth, setProviderHealth] = useState<string>("unknown");
  const [summary, setSummary] = useState<SymptomSummary | null>(null);
  const [matchResults, setMatchResults] = useState<{ matches: unknown[]; mock?: boolean } | null>(null);

  const startSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.request<{ sessionId: string; state: string; consentStatus: string }>("/api/v1/checkin/sessions", { method: "POST" });
      await refreshSession(res.sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start session");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async (sessionId: string) => {
    try {
      const s = await api.request<CheckInSession>(`/api/v1/checkin/sessions/${sessionId}`);
      setSession(s);
    } catch {
      // Session may not exist
    }
  }, []);

  const grantConsent = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      await api.request(`/api/v1/checkin/sessions/${session.sessionId}/consent`, {
        method: "POST",
        body: JSON.stringify({ consentStatus: "granted" })
      });
      await refreshSession(session.sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [session]);

  const startCapture = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      await api.request(`/api/v1/checkin/sessions/${session.sessionId}/capture/start`, { method: "POST" });
      await refreshSession(session.sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [session]);

  const stopCapture = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      await api.request(`/api/v1/checkin/sessions/${session.sessionId}/capture/stop`, { method: "POST" });
      await refreshSession(session.sessionId);
    } finally {
      setLoading(false);
    }
  }, [session]);

  const addMockTranscript = useCallback(async () => {
    if (!session) return;
    try {
      await api.request(`/api/v1/checkin/sessions/${session.sessionId}/transcript/mock`, { method: "POST" });
      await refreshSession(session.sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }, [session]);

  const extractFields = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      await api.request(`/api/v1/checkin/sessions/${session.sessionId}/extract`, { method: "POST" });
      await refreshSession(session.sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [session]);

  const generateSummary = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const s = await api.request<SymptomSummary>(`/api/v1/checkin/sessions/${session.sessionId}/summarize`, { method: "POST" });
      setSummary(s);
      await refreshSession(session.sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [session]);

  const acceptReview = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      await api.request(`/api/v1/checkin/sessions/${session.sessionId}/review`, {
        method: "POST",
        body: JSON.stringify({ reviewStatus: "accepted" })
      });
      await refreshSession(session.sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [session]);

  const rejectReview = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      await api.request(`/api/v1/checkin/sessions/${session.sessionId}/review`, {
        method: "POST",
        body: JSON.stringify({ reviewStatus: "rejected" })
      });
      await refreshSession(session.sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [session]);

  const cancelSession = useCallback(async () => {
    if (!session) return;
    try {
      await api.request(`/api/v1/checkin/sessions/${session.sessionId}/cancel`, { method: "POST" });
      await refreshSession(session.sessionId);
    } catch {
      // ignore
    }
  }, [session]);

  const copyProposal = useCallback(() => {
    if (!summary) return;
    navigator.clipboard.writeText(summary.symptomSummary).catch(() => {});
  }, [summary]);

  useEffect(() => {
    api.request<{ status: string }>("/api/v1/checkin/transcription/health").then((h: { status: string }) => {
      setProviderHealth(h.status);
    }).catch(() => setProviderHealth("unavailable"));
  }, []);

  const canCapture = session?.consentStatus === "granted";
  const hasUnresolvedConflicts = session?.fieldConflicts.some((c) => c.resolution === "unresolved") ?? false;

  return (
    <div className="checkin-view" role="dialog" aria-label="Guided Check-In">
      <div className="checkin-header">
        <h2>Guided Check-In</h2>
        <button className="checkin-close" onClick={onClose} aria-label="Close check-in">x</button>
      </div>

      {error && <div className="checkin-error" role="alert">{error}</div>}

      {!session && (
        <div className="checkin-start">
          <p>Start a new guided check-in session.</p>
          <button onClick={startSession} disabled={loading}>Start Check-In</button>
        </div>
      )}

      {session && (
        <div className="checkin-content">
          <div className="checkin-status-bar">
            <span className={`status-badge status-${session.state}`}>{session.state}</span>
            <span className={`consent-badge consent-${session.consentStatus}`}>
              Consent: {session.consentStatus}
            </span>
            <span className="provider-badge">Transcription: {providerHealth}</span>
          </div>

          {session.consentStatus === "not_requested" && (
            <div className="checkin-consent">
              <p>Audio will be used to assist with check-in. Customer consent is required before microphone capture.</p>
              <button onClick={grantConsent} disabled={loading}>Record Consent</button>
            </div>
          )}

          {session.consentStatus === "granted" && (
            <div className="checkin-capture-controls">
              {(session.state === "ready" || session.state === "paused") && (
                <button onClick={startCapture} disabled={loading}>Start Listening</button>
              )}
              {session.state === "listening" && (
                <>
                  <span className="recording-indicator" role="status">Recording</span>
                  <button onClick={stopCapture} disabled={loading}>Stop</button>
                  <button onClick={addMockTranscript}>Add Mock Transcript</button>
                </>
              )}
              {session.state === "paused" && (
                <button onClick={startCapture} disabled={loading}>Resume</button>
              )}
            </div>
          )}

          {session.consentStatus === "declined" && (
            <div className="checkin-manual-mode" role="status">
              Manual check-in mode. You can enter all fields manually below.
            </div>
          )}

          {session.transcriptSegments.length > 0 && (
            <div className="checkin-transcript" role="log" aria-label="Transcript">
              <h3>Transcript ({session.transcriptSegments.length} segments)</h3>
              {session.transcriptSegments.map((seg) => (
                <div key={seg.segmentId} className="transcript-segment">
                  <span className="speaker-role">{seg.speakerRole}:</span>
                  <span className="transcript-text">{seg.text}</span>
                </div>
              ))}
            </div>
          )}

          {session.extractedFields.length > 0 && (
            <div className="checkin-fields">
              <h3>Extracted Fields</h3>
              {session.extractedFields.map((f, i) => (
                <div key={i} className="field-row">
                  <span className="field-name">{f.field}</span>
                  <span className="field-value">{String(f.value)}</span>
                  <span className={`confidence-badge conf-${f.confidence}`}>{f.confidence}</span>
                  {f.employeeConfirmed && <span className="confirmed-badge">confirmed</span>}
                </div>
              ))}
            </div>
          )}

          {session.fieldConflicts.length > 0 && (
            <div className="checkin-conflicts" role="alert">
              <h3>Conflicts ({session.fieldConflicts.length})</h3>
              {session.fieldConflicts.map((c, i) => (
                <div key={i} className="conflict-row">
                  <span>{c.field}: {c.values.map((v) => String(v)).join(" vs ")}</span>
                  <span className={`resolution-badge res-${c.resolution}`}>{c.resolution}</span>
                </div>
              ))}
            </div>
          )}

          {session.missingFields.length > 0 && (
            <div className="checkin-missing">
              <h3>Missing Fields ({session.missingFields.length})</h3>
              <ul>
                {session.missingFields.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="checkin-actions">
            {session.transcriptSegments.length > 0 && (
              <button onClick={extractFields} disabled={loading}>Extract Fields</button>
            )}
            {session.extractedFields.length > 0 && (
              <button onClick={generateSummary} disabled={loading}>Generate Summary</button>
            )}
          </div>

          {summary && (
            <div className="checkin-review">
              <h3>Symptom Summary</h3>
              <div className="summary-content">{summary.symptomSummary}</div>
              {summary.warnings.length > 0 && (
                <div className="summary-warnings" role="alert">
                  {summary.warnings.map((w, i) => <div key={i}>{w}</div>)}
                </div>
              )}
              {summary.uncertainties.length > 0 && (
                <div className="summary-uncertainties">
                  <strong>Uncertainties:</strong>
                  <ul>{summary.uncertainties.map((u, i) => <li key={i}>{u}</li>)}</ul>
                </div>
              )}
              <div className="review-actions">
                <button onClick={acceptReview} disabled={loading || hasUnresolvedConflicts}>
                  Accept
                </button>
                <button onClick={rejectReview} disabled={loading}>Reject</button>
                <button onClick={copyProposal}>Copy</button>
                <button onClick={cancelSession}>Cancel Session</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
