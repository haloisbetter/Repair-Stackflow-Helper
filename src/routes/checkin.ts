import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { TemporaryCheckInStore } from "../checkin/temporary-checkin-store.js";
import type { TranscriptionProvider } from "../checkin/transcription-provider.js";
import { extractFieldsDeterministic } from "../checkin/mock-field-extractor.js";
import { summarizeSymptomsDeterministic } from "../checkin/mock-symptom-summarizer.js";
import { getRequiredFields, getMissingFields, getMissingQuestions, isAppleDevice } from "../checkin/missing-field-engine.js";
import { detectConflicts, canAcceptWithConflicts } from "../checkin/conflict-detector.js";
import type { CheckInSessionState, ConsentStatus, TranscriptSegment } from "../checkin/checkin-contract.js";
import type { ExtractCheckinFieldsInput } from "../checkin/checkin-task-contracts.js";
import { randomUUID } from "node:crypto";
import { computeIdempotencyKey } from "../jobs/idempotency-service.js";

export interface CheckInRouteDeps {
  store: TemporaryCheckInStore;
  transcriptionProvider: TranscriptionProvider;
  organizationId: string;
  locationId?: string | undefined;
}

const ConsentBody = z.object({ consentStatus: z.enum(["granted", "declined", "withdrawn"]) });
const UpdateFieldsBody = z.object({
  fields: z.array(z.object({
    field: z.string().min(1).max(128),
    value: z.unknown(),
    employeeConfirmed: z.boolean().default(false)
  })).max(100)
});
const ReviewBody = z.object({
  reviewStatus: z.enum(["accepted", "accepted_with_edits", "rejected"]),
  editedFields: z.record(z.unknown()).optional(),
  overrideReason: z.string().max(256).optional(),
  reviewerId: z.string().min(1).max(128).optional()
});
const CustomerMatchBody = z.object({
  phone: z.string().min(1).max(32).optional(),
  email: z.string().min(1).max(256).optional(),
  firstName: z.string().min(1).max(128).optional(),
  lastName: z.string().min(1).max(128).optional()
});
const DeviceMatchBody = z.object({
  serialNumber: z.string().min(1).max(128).optional(),
  manufacturer: z.string().min(1).max(128).optional(),
  model: z.string().min(1).max(256).optional()
});

export function registerCheckInRoutes(app: FastifyInstance, deps: CheckInRouteDeps): void {
  const { store, transcriptionProvider } = deps;

  app.post("/api/v1/checkin/sessions", async (_req, reply) => {
    const session = store.create({
      organizationId: deps.organizationId,
      locationId: deps.locationId ?? undefined
    });
    return reply.send({
      sessionId: session.sessionId,
      state: session.state,
      consentStatus: session.consentStatus,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt
    });
  });

  app.get("/api/v1/checkin/sessions/:sessionId", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = store.get(sessionId);
    if (!session) return reply.status(404).send({ error: { code: "session_not_found" } });
    return reply.send(sanitizeSession(session));
  });

  app.get("/api/v1/checkin/sessions/active", async (_req, reply) => {
    const session = store.getActive();
    if (!session) return reply.status(404).send({ error: { code: "no_active_session" } });
    return reply.send(sanitizeSession(session));
  });

  app.post("/api/v1/checkin/sessions/:sessionId/consent", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const parsed = ConsentBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: { code: "validation_failed" } });
    try {
      const session = store.setConsent(sessionId, parsed.data.consentStatus as ConsentStatus);
      if (parsed.data.consentStatus === "granted") {
        store.updateState(sessionId, "ready" as CheckInSessionState);
      }
      return reply.send(sanitizeSession(store.get(sessionId)!));
    } catch (e) {
      return reply.status(400).send({ error: { code: "consent_failed", message: e instanceof Error ? e.message : "Failed" } });
    }
  });

  app.post("/api/v1/checkin/sessions/:sessionId/capture/start", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = store.get(sessionId);
    if (!session) return reply.status(404).send({ error: { code: "session_not_found" } });
    if (session.consentStatus !== "granted") {
      return reply.status(403).send({ error: { code: "consent_required", message: "Cannot start capture without consent." } });
    }
    try {
      const updated = store.updateState(sessionId, "listening" as CheckInSessionState);
      return reply.send({
        sessionId,
        state: updated.state,
        captureStartedAt: new Date().toISOString()
      });
    } catch (e) {
      return reply.status(400).send({ error: { code: "capture_failed", message: e instanceof Error ? e.message : "Failed" } });
    }
  });

  app.post("/api/v1/checkin/sessions/:sessionId/capture/pause", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    try {
      store.updateState(sessionId, "paused" as CheckInSessionState);
      return reply.send({ sessionId, state: "paused" });
    } catch (e) {
      return reply.status(400).send({ error: { code: "state_error", message: e instanceof Error ? e.message : "Failed" } });
    }
  });

  app.post("/api/v1/checkin/sessions/:sessionId/capture/resume", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    try {
      store.updateState(sessionId, "listening" as CheckInSessionState);
      return reply.send({ sessionId, state: "listening" });
    } catch (e) {
      return reply.status(400).send({ error: { code: "state_error", message: e instanceof Error ? e.message : "Failed" } });
    }
  });

  app.post("/api/v1/checkin/sessions/:sessionId/capture/stop", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    try {
      const session = store.get(sessionId);
      if (!session) return reply.status(404).send({ error: { code: "session_not_found" } });
      const updated = store.updateState(sessionId, "processing" as CheckInSessionState);
      return reply.send({ sessionId, state: updated.state });
    } catch (e) {
      return reply.status(400).send({ error: { code: "state_error", message: e instanceof Error ? e.message : "Failed" } });
    }
  });

  app.post("/api/v1/checkin/sessions/:sessionId/transcript/audio", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = store.get(sessionId);
    if (!session) return reply.status(404).send({ error: { code: "session_not_found" } });
    if (session.consentStatus !== "granted") {
      return reply.status(403).send({ error: { code: "consent_required" } });
    }

    const chunk = req.body as ArrayBuffer;
    if (!chunk || chunk.byteLength === 0) {
      return reply.status(400).send({ error: { code: "empty_audio" } });
    }
    if (chunk.byteLength > 10 * 1024 * 1024) {
      return reply.status(413).send({ error: { code: "audio_too_large", message: "Audio chunk exceeds 10MB limit." } });
    }

    try {
      const result = await transcriptionProvider.transcribeChunk({
        audioChunk: chunk,
        sessionStartTimeMs: session.captureStartedAt ? new Date(session.captureStartedAt).getTime() : Date.now(),
        speakerRole: "customer"
      });
      const updated = store.addTranscriptSegments(sessionId, result.segments);
      return reply.send({ segments: result.segments, totalSegments: updated.transcriptSegments.length, providerName: result.providerName });
    } catch (e) {
      return reply.status(502).send({ error: { code: "transcription_failed", message: e instanceof Error ? e.message : "Transcription provider error" } });
    }
  });

  app.post("/api/v1/checkin/sessions/:sessionId/transcript/manual", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = store.get(sessionId);
    if (!session) return reply.status(404).send({ error: { code: "session_not_found" } });

    const body = req.body as { text?: string; speakerRole?: string };
    if (!body?.text || body.text.trim().length === 0) {
      return reply.status(400).send({ error: { code: "validation_failed", message: "text is required" } });
    }

    const segment: TranscriptSegment = {
      segmentId: `manual-${Date.now()}`,
      text: body.text.trim(),
      startTimeMs: Date.now() - new Date(session.createdAt).getTime(),
      endTimeMs: Date.now() - new Date(session.createdAt).getTime(),
      speakerRole: (body.speakerRole === "customer" || body.speakerRole === "employee") ? body.speakerRole : "employee",
      provider: "manual",
      status: "final"
    };
    const updated = store.addTranscriptSegments(sessionId, [segment]);
    return reply.send({ segments: [segment], totalSegments: updated.transcriptSegments.length });
  });

  app.post("/api/v1/checkin/sessions/:sessionId/transcript/mock", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = store.get(sessionId);
    if (!session) return reply.status(404).send({ error: { code: "session_not_found" } });
    if (session.consentStatus !== "granted") {
      return reply.status(403).send({ error: { code: "consent_required" } });
    }

    try {
      const result = await transcriptionProvider.transcribeChunk({
        audioChunk: new ArrayBuffer(0),
        sessionStartTimeMs: Date.now(),
        speakerRole: "customer"
      });
      const updated = store.addTranscriptSegments(sessionId, result.segments);
      return reply.send({ segments: result.segments, totalSegments: updated.transcriptSegments.length });
    } catch (e) {
      return reply.status(400).send({ error: { code: "transcription_failed", message: e instanceof Error ? e.message : "Failed" } });
    }
  });

  app.post("/api/v1/checkin/sessions/:sessionId/extract", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = store.get(sessionId);
    if (!session) return reply.status(404).send({ error: { code: "session_not_found" } });

    const extractInput: ExtractCheckinFieldsInput = {
      transcriptSegments: session.transcriptSegments.map((s) => ({
        segmentId: s.segmentId,
        text: s.text,
        speakerRole: s.speakerRole
      })),
      employeeEnteredFacts: {},
      existingConfirmedFields: session.extractedFields
        .filter((f) => f.employeeConfirmed)
        .map((f) => ({ field: f.field, value: f.value, employeeConfirmed: true }))
    };

    const result = extractFieldsDeterministic(extractInput);

    const fieldValues = [...session.extractedFields.filter((f) => f.employeeConfirmed), ...result.extractedFields];
    store.setExtractedFields(sessionId, fieldValues);

    const conflicts = detectConflicts(fieldValues, session.transcriptSegments);
    store.setFieldConflicts(sessionId, conflicts);

    const deviceFields = fieldValues.filter((f) => f.field.startsWith("device."));
    const manufacturer = deviceFields.find((f) => f.field === "device.manufacturer")?.value as string | undefined;
    const deviceCategory = deviceFields.find((f) => f.field === "device.deviceCategory")?.value as string | undefined;

    const required = getRequiredFields({
      deviceCategory: deviceCategory ?? undefined,
      manufacturer: manufacturer ?? undefined,
      isAppleDevice: isAppleDevice(manufacturer ?? undefined)
    });
    const fieldSet = buildFieldSetFromExtracted(fieldValues);
    const missing = getMissingFields(fieldSet, required);
    store.setMissingFields(sessionId, missing);

    if (missing.length > 0 || conflicts.some((c) => c.resolution === "unresolved")) {
      store.updateState(sessionId, "needs_information" as CheckInSessionState);
    }

    return reply.send({
      extractedFields: result.extractedFields,
      conflicts,
      missingFields: missing,
      missingQuestions: getMissingQuestions(fieldSet, required),
      warnings: result.warnings
    });
  });

  app.post("/api/v1/checkin/sessions/:sessionId/fields", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const parsed = UpdateFieldsBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: { code: "validation_failed" } });
    const session = store.get(sessionId);
    if (!session) return reply.status(404).send({ error: { code: "session_not_found" } });

    for (const field of parsed.data.fields) {
      const existing = session.extractedFields.find((f) => f.field === field.field);
      store.addEmployeeCorrection(sessionId, field.field, existing?.value, field.value);
    }

    const updatedFields = [...session.extractedFields];
    for (const field of parsed.data.fields) {
      const idx = updatedFields.findIndex((f) => f.field === field.field);
      if (idx >= 0) {
        updatedFields[idx] = { ...updatedFields[idx]!, value: field.value, employeeConfirmed: field.employeeConfirmed, confidence: "confirmed" };
      } else {
        updatedFields.push({
          field: field.field,
          value: field.value,
          confidence: "confirmed",
          sourceSegmentIds: [],
          employeeConfirmed: field.employeeConfirmed
        });
      }
    }
    store.setExtractedFields(sessionId, updatedFields);

    return reply.send({ fields: updatedFields.length });
  });

  app.post("/api/v1/checkin/sessions/:sessionId/summarize", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = store.get(sessionId);
    if (!session) return reply.status(404).send({ error: { code: "session_not_found" } });

    const fields = buildFieldSetFromExtracted(session.extractedFields);
    const summaryInput = {
      customerReportedIssue: fields.repairIntake?.customerReportedIssue,
      whenIssueStarted: fields.repairIntake?.whenIssueStarted,
      frequency: fields.repairIntake?.frequency,
      triggeringEvent: fields.repairIntake?.triggeringEvent,
      troubleshootingAlreadyTried: fields.repairIntake?.troubleshootingAlreadyTried,
      liquidExposure: fields.repairIntake?.liquidExposure,
      physicalDamage: fields.repairIntake?.physicalDamage,
      dataImportance: fields.repairIntake?.dataImportance,
      backupStatus: fields.repairIntake?.backupStatus,
      powerState: fields.repairIntake?.powerState,
      deviceDescription: fields.device ? [fields.device.manufacturer, fields.device.model].filter(Boolean).join(" ") : undefined
    };

    const summary = summarizeSymptomsDeterministic(summaryInput);
    store.setSymptomSummary(sessionId, summary as unknown as Record<string, unknown>);

    if (session.missingFields.length === 0 || canAcceptWithConflicts(session.fieldConflicts)) {
      store.updateState(sessionId, "ready_for_review" as CheckInSessionState);
      store.setReviewStatus(sessionId, "pending_review");
    }

    return reply.send(summary);
  });

  app.post("/api/v1/checkin/sessions/:sessionId/review", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const parsed = ReviewBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: { code: "validation_failed" } });
    const session = store.get(sessionId);
    if (!session) return reply.status(404).send({ error: { code: "session_not_found" } });
    if (!session.symptomSummaryProposal) return reply.status(400).send({ error: { code: "no_proposal" } });

    if (parsed.data.reviewStatus === "accepted" || parsed.data.reviewStatus === "accepted_with_edits") {
      if (!canAcceptWithConflicts(session.fieldConflicts, parsed.data.overrideReason)) {
        return reply.status(400).send({ error: { code: "unresolved_conflicts", message: "Cannot accept with unresolved conflicts without an override reason." } });
      }
      const newState = parsed.data.reviewStatus === "accepted" ? "accepted" : "accepted";
      store.updateState(sessionId, newState as CheckInSessionState);
      store.setReviewStatus(sessionId, parsed.data.reviewStatus, randomUUID());
    } else {
      store.updateState(sessionId, "rejected" as CheckInSessionState);
      store.setReviewStatus(sessionId, "rejected");
    }

    return reply.send({
      sessionId,
      reviewStatus: parsed.data.reviewStatus,
      state: store.get(sessionId)?.state ?? "unknown"
    });
  });

  app.post("/api/v1/checkin/sessions/:sessionId/cancel", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    try {
      store.updateState(sessionId, "cancelled" as CheckInSessionState);
      return reply.send({ sessionId, state: "cancelled" });
    } catch (e) {
      return reply.status(400).send({ error: { code: "cancel_failed", message: e instanceof Error ? e.message : "Failed" } });
    }
  });

  app.get("/api/v1/checkin/transcription/health", async (_req, reply) => {
    const health = await transcriptionProvider.getHealth();
    return reply.send(health);
  });

  app.get("/api/v1/checkin/metrics", async (_req, reply) => {
    const metrics = store.getSessionMetrics();
    return reply.send(metrics);
  });

  app.post("/api/v1/checkin/matches/customers", async (req, reply) => {
    const parsed = CustomerMatchBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: { code: "validation_failed" } });
    return reply.send({ matches: [], mock: true, message: "Customer matching requires backend integration." });
  });

  app.post("/api/v1/checkin/matches/devices", async (req, reply) => {
    const parsed = DeviceMatchBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: { code: "validation_failed" } });
    return reply.send({ matches: [], mock: true, message: "Device matching requires backend integration." });
  });
}

function sanitizeSession(session: import("../checkin/checkin-contract.js").GuidedCheckInSession) {
  return {
    sessionId: session.sessionId,
    state: session.state,
    consentStatus: session.consentStatus,
    consentRecordedAt: session.consentRecordedAt,
    captureStartedAt: session.captureStartedAt,
    captureStoppedAt: session.captureStoppedAt,
    transcriptSegments: session.transcriptSegments,
    extractedFields: session.extractedFields,
    fieldConflicts: session.fieldConflicts,
    missingFields: session.missingFields,
    employeeCorrections: session.employeeCorrections,
    symptomSummaryProposal: session.symptomSummaryProposal,
    reviewStatus: session.reviewStatus,
    proposalId: session.proposalId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt
  };
}

function buildFieldSetFromExtracted(fields: import("../checkin/checkin-contract.js").ExtractedFieldValue[]): import("../checkin/checkin-fields.js").CheckInFieldSet {
  const result: Record<string, Record<string, unknown>> = { customer: {}, device: {}, repairIntake: {}, operational: {} };
  for (const f of fields) {
    const [section, key] = f.field.split(".");
    if (section && key && section in result) {
      result[section]![key] = f.value;
    }
  }
  return result as unknown as import("../checkin/checkin-fields.js").CheckInFieldSet;
}
