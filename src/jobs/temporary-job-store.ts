import { randomUUID } from "node:crypto";
import type { JobResultSubmission } from "../contracts/v1/results.js";
import type { JobFailureSubmission } from "../contracts/v1/results.js";

export interface StoredJobResult extends JobResultSubmission {
  storedAt: string;
  expiresAt: number;
}

export interface StoredJobFailure extends JobFailureSubmission {
  storedAt: string;
  expiresAt: number;
}

export interface ActiveJob {
  jobId: string;
  requestId: string;
  task: string;
  startedAt: string;
  technicianNote: string;
}

const MAX_COMPLETED = 8;
const RESULT_TTL_MS = 5 * 60 * 1000;

export class TemporaryJobStore {
  private active: ActiveJob | null = null;
  private readonly completed = new Map<string, StoredJobResult>();
  private readonly failures = new Map<string, StoredJobFailure>();
  private lastSanitizedError: { code: string; message: string; at: string } | null = null;

  getActiveJob(): ActiveJob | null {
    return this.active;
  }

  beginJob(job: { jobId: string; requestId: string; task: string; technicianNote: string }): void {
    if (this.active) {
      throw new Error("active_job_conflict: a job is already in progress");
    }
    this.active = {
      jobId: job.jobId,
      requestId: job.requestId,
      task: job.task,
      startedAt: new Date().toISOString(),
      technicianNote: job.technicianNote
    };
  }

  completeJob(result: JobResultSubmission): void {
    const stored: StoredJobResult = {
      ...result,
      storedAt: new Date().toISOString(),
      expiresAt: Date.now() + RESULT_TTL_MS
    };
    this.completed.set(result.idempotencyKey, stored);
    this.purgeExpired();
    if (this.completed.size > MAX_COMPLETED) {
      const oldest = Array.from(this.completed.values()).sort((a, b) => a.storedAt.localeCompare(b.storedAt));
      for (let i = 0; i < oldest.length - MAX_COMPLETED; i++) {
        const item = oldest[i];
        if (item) this.completed.delete(item.idempotencyKey);
      }
    }
    this.clearActive();
  }

  recordFailure(failure: JobFailureSubmission): void {
    const stored: StoredJobFailure = {
      ...failure,
      storedAt: new Date().toISOString(),
      expiresAt: Date.now() + RESULT_TTL_MS
    };
    this.failures.set(failure.jobId, stored);
    this.lastSanitizedError = { code: failure.errorCode, message: "[redacted]", at: stored.storedAt };
    this.clearActive();
  }

  getResult(idempotencyKey: string): StoredJobResult | null {
    this.purgeExpired();
    const r = this.completed.get(idempotencyKey);
    return r ?? null;
  }

  getResultByJob(jobId: string): StoredJobResult | null {
    this.purgeExpired();
    for (const r of this.completed.values()) {
      if (r.jobId === jobId) return r;
    }
    return null;
  }

  getFailure(jobId: string): StoredJobFailure | null {
    this.purgeExpired();
    return this.failures.get(jobId) ?? null;
  }

  clearActive(): void {
    this.active = null;
  }

  clearResult(jobId: string): boolean {
    for (const [key, r] of this.completed) {
      if (r.jobId === jobId) {
        this.completed.delete(key);
        return true;
      }
    }
    return false;
  }

  clearAllResults(): void {
    this.completed.clear();
    this.failures.clear();
    this.lastSanitizedError = null;
  }

  getLastSanitizedError(): { code: string; message: string; at: string } | null {
    return this.lastSanitizedError;
  }

  clearLastSanitizedError(): void {
    this.lastSanitizedError = null;
  }

  setLastSanitizedError(code: string): void {
    this.lastSanitizedError = { code, message: "[redacted]", at: new Date().toISOString() };
  }

  snapshot(): {
    active: ActiveJob | null;
    completedCount: number;
    failureCount: number;
    completed: StoredJobResult[];
  } {
    this.purgeExpired();
    return {
      active: this.active,
      completedCount: this.completed.size,
      failureCount: this.failures.size,
      completed: Array.from(this.completed.values())
    };
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, r] of this.completed) {
      if (r.expiresAt <= now) this.completed.delete(key);
    }
    for (const [key, f] of this.failures) {
      if (f.expiresAt <= now) this.failures.delete(key);
    }
  }
}

export function newJobIds(): { jobId: string; requestId: string } {
  return { jobId: randomUUID(), requestId: randomUUID() };
}
