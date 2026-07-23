/**
 * Durable pending-submission store for results that completed locally
 * but were not yet acknowledged by Repair StackFlow.
 *
 * Persisted data:
 * - submissionKey: stable identifier from the backend-issued job
 * - jobId: for traceability
 * - type: "result" | "failure"
 * - payload: the exact ResultSubmission or FailureSubmission JSON to retry
 * - enqueuedAt: when the item was first queued
 * - attemptCount: number of submission attempts
 * - nextRetryAt: when the next retry should occur
 * - status: "pending" | "acknowledged" | "dead_letter"
 *
 * Why payload is stored: the backend needs the full submission envelope to
 * accept the result. Without it, the Helper cannot retry submission after restart.
 *
 * Retention: items expire after 24 hours. Dead-letter items are retained for 48 hours
 * for debugging, then removed. Maximum 32 items.
 *
 * Security in current prototype: stored as JSON on disk (mode 0o600). NOT encrypted.
 * Future native macOS implementation MUST use encrypted storage or Keychain data protection.
 */
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { resolveConfigurationPaths } from "../config/configuration-paths.js";

const MAX_PENDING_ITEMS = 32;
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const DEAD_LETTER_TTL_MS = 48 * 60 * 60 * 1000;

export interface PendingSubmissionItem {
  submissionKey: string;
  jobId: string;
  type: "result" | "failure";
  payload: Record<string, unknown>;
  enqueuedAt: string;
  attemptCount: number;
  nextRetryAt: string;
  status: "pending" | "acknowledged" | "dead_letter";
  lastAttemptAt?: string;
}

export interface PendingSubmissionStore {
  enqueue(item: Omit<PendingSubmissionItem, "status">): Promise<void>;
  listPending(limit?: number): Promise<PendingSubmissionItem[]>;
  markAttempt(submissionKey: string): Promise<void>;
  markAcknowledged(submissionKey: string): Promise<void>;
  markDeadLetter(submissionKey: string): Promise<void>;
  expire(): Promise<number>;
  remove(submissionKey: string): Promise<void>;
  clear(): Promise<void>;
  count(): Promise<{ pending: number; deadLetter: number; total: number }>;
}

export class FilePendingSubmissionStore implements PendingSubmissionStore {
  private readonly filePath: string;

  constructor(directory?: string) {
    const paths = resolveConfigurationPaths(directory);
    this.filePath = join(paths.directory, "pending-submissions.json");
  }

  private async loadAll(): Promise<PendingSubmissionItem[]> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as PendingSubmissionItem[];
    } catch {
      return [];
    }
  }

  private async saveAll(items: PendingSubmissionItem[]): Promise<void> {
    const dir = this.filePath.replace(/[/\\][^/\\]+$/, "");
    await mkdir(dir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(items, null, 2), { encoding: "utf-8", mode: 0o600 });
  }

  async enqueue(item: Omit<PendingSubmissionItem, "status">): Promise<void> {
    const items = await this.loadAll();
    const existing = items.find((i) => i.submissionKey === item.submissionKey);
    if (existing) return; // already queued

    items.push({ ...item, status: "pending" });

    // Enforce max items — remove oldest acknowledged first, then oldest dead-letter
    while (items.length > MAX_PENDING_ITEMS) {
      const ackIdx = items.findIndex((i) => i.status === "acknowledged");
      if (ackIdx >= 0) { items.splice(ackIdx, 1); continue; }
      const dlIdx = items.findIndex((i) => i.status === "dead_letter");
      if (dlIdx >= 0) { items.splice(dlIdx, 1); continue; }
      items.shift(); // oldest pending
    }

    await this.saveAll(items);
  }

  async listPending(limit = 10): Promise<PendingSubmissionItem[]> {
    const items = await this.loadAll();
    return items.filter((i) => i.status === "pending").slice(0, limit);
  }

  async markAttempt(submissionKey: string): Promise<void> {
    const items = await this.loadAll();
    const item = items.find((i) => i.submissionKey === submissionKey);
    if (!item) return;
    item.attemptCount++;
    item.lastAttemptAt = new Date().toISOString();
    const backoff = Math.min(2000 * Math.pow(2, item.attemptCount), 60_000);
    item.nextRetryAt = new Date(Date.now() + backoff).toISOString();
    await this.saveAll(items);
  }

  async markAcknowledged(submissionKey: string): Promise<void> {
    const items = await this.loadAll();
    const item = items.find((i) => i.submissionKey === submissionKey);
    if (!item) return;
    item.status = "acknowledged";
    await this.saveAll(items);
  }

  async markDeadLetter(submissionKey: string): Promise<void> {
    const items = await this.loadAll();
    const item = items.find((i) => i.submissionKey === submissionKey);
    if (!item) return;
    item.status = "dead_letter";
    await this.saveAll(items);
  }

  async expire(): Promise<number> {
    const items = await this.loadAll();
    const now = Date.now();
    const before = items.length;
    const kept = items.filter((item) => {
      const age = now - new Date(item.enqueuedAt).getTime();
      if (item.status === "acknowledged") return false; // remove acked
      if (item.status === "dead_letter" && age > DEAD_LETTER_TTL_MS) return false;
      if (item.status === "pending" && age > PENDING_TTL_MS) return false;
      return true;
    });
    if (kept.length !== before) {
      await this.saveAll(kept);
    }
    return before - kept.length;
  }

  async remove(submissionKey: string): Promise<void> {
    const items = await this.loadAll();
    const filtered = items.filter((i) => i.submissionKey !== submissionKey);
    if (filtered.length !== items.length) {
      await this.saveAll(filtered);
    }
  }

  async clear(): Promise<void> {
    await unlink(this.filePath).catch(() => {});
  }

  async count(): Promise<{ pending: number; deadLetter: number; total: number }> {
    const items = await this.loadAll();
    return {
      pending: items.filter((i) => i.status === "pending").length,
      deadLetter: items.filter((i) => i.status === "dead_letter").length,
      total: items.length
    };
  }
}

export class InMemoryPendingSubmissionStore implements PendingSubmissionStore {
  private items: PendingSubmissionItem[] = [];

  async enqueue(item: Omit<PendingSubmissionItem, "status">): Promise<void> {
    if (this.items.find((i) => i.submissionKey === item.submissionKey)) return;
    this.items.push({ ...item, status: "pending" });
    while (this.items.length > MAX_PENDING_ITEMS) this.items.shift();
  }

  async listPending(limit = 10): Promise<PendingSubmissionItem[]> {
    return this.items.filter((i) => i.status === "pending").slice(0, limit);
  }

  async markAttempt(submissionKey: string): Promise<void> {
    const item = this.items.find((i) => i.submissionKey === submissionKey);
    if (item) {
      item.attemptCount++;
      item.lastAttemptAt = new Date().toISOString();
      item.nextRetryAt = new Date(Date.now() + 2000 * Math.pow(2, item.attemptCount)).toISOString();
    }
  }

  async markAcknowledged(submissionKey: string): Promise<void> {
    const item = this.items.find((i) => i.submissionKey === submissionKey);
    if (item) item.status = "acknowledged";
  }

  async markDeadLetter(submissionKey: string): Promise<void> {
    const item = this.items.find((i) => i.submissionKey === submissionKey);
    if (item) item.status = "dead_letter";
  }

  async expire(): Promise<number> {
    const before = this.items.length;
    const now = Date.now();
    this.items = this.items.filter((item) => {
      const age = now - new Date(item.enqueuedAt).getTime();
      if (item.status === "acknowledged") return false;
      if (item.status === "dead_letter" && age > DEAD_LETTER_TTL_MS) return false;
      if (item.status === "pending" && age > PENDING_TTL_MS) return false;
      return true;
    });
    return before - this.items.length;
  }

  async remove(submissionKey: string): Promise<void> {
    this.items = this.items.filter((i) => i.submissionKey !== submissionKey);
  }

  async clear(): Promise<void> {
    this.items = [];
  }

  async count(): Promise<{ pending: number; deadLetter: number; total: number }> {
    return {
      pending: this.items.filter((i) => i.status === "pending").length,
      deadLetter: this.items.filter((i) => i.status === "dead_letter").length,
      total: this.items.length
    };
  }
}
