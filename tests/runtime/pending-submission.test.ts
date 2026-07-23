import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryPendingSubmissionStore } from "../../src/runtime/pending-submission-store.js";

describe("InMemoryPendingSubmissionStore", () => {
  let store: InMemoryPendingSubmissionStore;

  beforeEach(() => {
    store = new InMemoryPendingSubmissionStore();
  });

  it("starts empty", async () => {
    const counts = await store.count();
    expect(counts.total).toBe(0);
    expect(counts.pending).toBe(0);
  });

  it("enqueues an item", async () => {
    await store.enqueue({
      submissionKey: "sk-001",
      jobId: "job-001",
      type: "result",
      payload: { test: true },
      enqueuedAt: new Date().toISOString(),
      attemptCount: 0,
      nextRetryAt: new Date().toISOString()
    });
    const counts = await store.count();
    expect(counts.pending).toBe(1);
  });

  it("deduplicates by submissionKey", async () => {
    const item = {
      submissionKey: "sk-001",
      jobId: "job-001",
      type: "result" as const,
      payload: { test: true },
      enqueuedAt: new Date().toISOString(),
      attemptCount: 0,
      nextRetryAt: new Date().toISOString()
    };
    await store.enqueue(item);
    await store.enqueue(item);
    const counts = await store.count();
    expect(counts.pending).toBe(1);
  });

  it("lists pending items", async () => {
    await store.enqueue({
      submissionKey: "sk-001",
      jobId: "job-001",
      type: "result",
      payload: {},
      enqueuedAt: new Date().toISOString(),
      attemptCount: 0,
      nextRetryAt: new Date().toISOString()
    });
    const pending = await store.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.status).toBe("pending");
  });

  it("marks item as acknowledged", async () => {
    await store.enqueue({
      submissionKey: "sk-001",
      jobId: "job-001",
      type: "result",
      payload: {},
      enqueuedAt: new Date().toISOString(),
      attemptCount: 0,
      nextRetryAt: new Date().toISOString()
    });
    await store.markAcknowledged("sk-001");
    const pending = await store.listPending();
    expect(pending).toHaveLength(0);
  });

  it("marks item as dead letter", async () => {
    await store.enqueue({
      submissionKey: "sk-001",
      jobId: "job-001",
      type: "result",
      payload: {},
      enqueuedAt: new Date().toISOString(),
      attemptCount: 0,
      nextRetryAt: new Date().toISOString()
    });
    await store.markDeadLetter("sk-001");
    const counts = await store.count();
    expect(counts.deadLetter).toBe(1);
    expect(counts.pending).toBe(0);
  });

  it("increments attempt count", async () => {
    await store.enqueue({
      submissionKey: "sk-001",
      jobId: "job-001",
      type: "result",
      payload: {},
      enqueuedAt: new Date().toISOString(),
      attemptCount: 0,
      nextRetryAt: new Date().toISOString()
    });
    await store.markAttempt("sk-001");
    await store.markAttempt("sk-001");
    const pending = await store.listPending();
    expect(pending[0]?.attemptCount).toBe(2);
  });

  it("removes item by submissionKey", async () => {
    await store.enqueue({
      submissionKey: "sk-001",
      jobId: "job-001",
      type: "result",
      payload: {},
      enqueuedAt: new Date().toISOString(),
      attemptCount: 0,
      nextRetryAt: new Date().toISOString()
    });
    await store.remove("sk-001");
    expect((await store.count()).total).toBe(0);
  });

  it("clears all items", async () => {
    await store.enqueue({ submissionKey: "sk-001", jobId: "j-1", type: "result", payload: {}, enqueuedAt: new Date().toISOString(), attemptCount: 0, nextRetryAt: new Date().toISOString() });
    await store.enqueue({ submissionKey: "sk-002", jobId: "j-2", type: "failure", payload: {}, enqueuedAt: new Date().toISOString(), attemptCount: 0, nextRetryAt: new Date().toISOString() });
    await store.clear();
    expect((await store.count()).total).toBe(0);
  });

  it("expires old acknowledged items", async () => {
    await store.enqueue({
      submissionKey: "sk-001",
      jobId: "job-001",
      type: "result",
      payload: {},
      enqueuedAt: new Date().toISOString(),
      attemptCount: 0,
      nextRetryAt: new Date().toISOString()
    });
    await store.markAcknowledged("sk-001");
    const expired = await store.expire();
    expect(expired).toBe(1);
  });

  it("different jobIds with same content remain distinct", async () => {
    await store.enqueue({ submissionKey: "sk-001", jobId: "job-AAA", type: "result", payload: { note: "same" }, enqueuedAt: new Date().toISOString(), attemptCount: 0, nextRetryAt: new Date().toISOString() });
    await store.enqueue({ submissionKey: "sk-002", jobId: "job-BBB", type: "result", payload: { note: "same" }, enqueuedAt: new Date().toISOString(), attemptCount: 0, nextRetryAt: new Date().toISOString() });
    expect((await store.count()).pending).toBe(2);
  });
});
