import { describe, it, expect } from "vitest";
import { HelperStateMachine, JobStateMachine } from "../../src/runtime/state-machines.js";

describe("HelperStateMachine", () => {
  it("starts in unconfigured state", () => {
    const sm = new HelperStateMachine();
    expect(sm.state).toBe("unconfigured");
  });

  it("allows valid transitions: unconfigured → unpaired", () => {
    const sm = new HelperStateMachine();
    sm.transition("unpaired");
    expect(sm.state).toBe("unpaired");
  });

  it("allows valid transitions: unpaired → pairing → paired → ready", () => {
    const sm = new HelperStateMachine("unpaired");
    sm.transition("pairing");
    sm.transition("paired");
    sm.transition("ready");
    expect(sm.state).toBe("ready");
  });

  it("rejects invalid transitions", () => {
    const sm = new HelperStateMachine("unpaired");
    expect(() => sm.transition("ready")).toThrow("Invalid helper state transition");
  });

  it("rejects unpaired → connecting (must go through pairing)", () => {
    const sm = new HelperStateMachine("unpaired");
    expect(() => sm.transition("connecting")).toThrow("Invalid helper state transition");
  });

  it("ready → degraded is valid", () => {
    const sm = new HelperStateMachine("ready");
    sm.transition("degraded");
    expect(sm.state).toBe("degraded");
  });

  it("degraded → ready is valid (recovery)", () => {
    const sm = new HelperStateMachine("degraded");
    sm.transition("ready");
    expect(sm.state).toBe("ready");
  });

  it("ready → credential_expired is valid", () => {
    const sm = new HelperStateMachine("ready");
    sm.transition("credential_expired");
    expect(sm.state).toBe("credential_expired");
  });

  it("ready → credential_revoked is valid", () => {
    const sm = new HelperStateMachine("ready");
    sm.transition("credential_revoked");
    expect(sm.state).toBe("credential_revoked");
  });

  it("credential_revoked can only go to unpaired or error", () => {
    const sm = new HelperStateMachine("credential_revoked");
    expect(sm.canTransition("unpaired")).toBe(true);
    expect(sm.canTransition("error")).toBe(true);
    expect(sm.canTransition("ready")).toBe(false);
    expect(sm.canTransition("pairing")).toBe(false);
  });

  it("force() bypasses transition validation", () => {
    const sm = new HelperStateMachine("unpaired");
    sm.force("ready");
    expect(sm.state).toBe("ready");
  });

  it("reset() forces to unpaired", () => {
    const sm = new HelperStateMachine("ready");
    sm.reset();
    expect(sm.state).toBe("unpaired");
  });

  it("isProcessingCapable returns true only for ready and degraded", () => {
    expect(new HelperStateMachine("ready").isProcessingCapable()).toBe(true);
    expect(new HelperStateMachine("degraded").isProcessingCapable()).toBe(true);
    expect(new HelperStateMachine("unpaired").isProcessingCapable()).toBe(false);
    expect(new HelperStateMachine("offline").isProcessingCapable()).toBe(false);
  });

  it("isPaired returns true for paired/connecting/ready/degraded", () => {
    expect(new HelperStateMachine("paired").isPaired()).toBe(true);
    expect(new HelperStateMachine("connecting").isPaired()).toBe(true);
    expect(new HelperStateMachine("ready").isPaired()).toBe(true);
    expect(new HelperStateMachine("degraded").isPaired()).toBe(true);
    expect(new HelperStateMachine("unpaired").isPaired()).toBe(false);
    expect(new HelperStateMachine("credential_expired").isPaired()).toBe(false);
  });

  it("emits state change events", () => {
    const sm = new HelperStateMachine("unpaired");
    const events: Array<{ from: string; to: string }> = [];
    sm.onChange((from, to) => events.push({ from, to }));
    sm.transition("pairing");
    sm.transition("paired");
    expect(events).toEqual([
      { from: "unpaired", to: "pairing" },
      { from: "pairing", to: "paired" }
    ]);
  });

  it("listener can be removed", () => {
    const sm = new HelperStateMachine("unpaired");
    const events: string[] = [];
    const remove = sm.onChange((_from, to) => events.push(to));
    sm.transition("pairing");
    remove();
    sm.transition("paired");
    expect(events).toEqual(["pairing"]);
  });

  it("connecting → incompatible is valid", () => {
    const sm = new HelperStateMachine("connecting");
    sm.transition("incompatible");
    expect(sm.state).toBe("incompatible");
  });

  it("offline → connecting is valid (reconnection)", () => {
    const sm = new HelperStateMachine("offline");
    sm.transition("connecting");
    expect(sm.state).toBe("connecting");
  });

  it("error → ready is valid (recovery)", () => {
    const sm = new HelperStateMachine("error");
    sm.transition("ready");
    expect(sm.state).toBe("ready");
  });
});

describe("JobStateMachine", () => {
  it("starts in queued state", () => {
    const sm = new JobStateMachine("job-1");
    expect(sm.state).toBe("queued");
    expect(sm.jobId).toBe("job-1");
  });

  it("normal success path: queued → claimed → leased → running → validating → submitting → completed", () => {
    const sm = new JobStateMachine("job-1");
    sm.transition("claimed");
    sm.transition("leased");
    sm.transition("running");
    sm.transition("validating");
    sm.transition("submitting");
    sm.transition("completed");
    expect(sm.state).toBe("completed");
    expect(sm.isTerminal()).toBe(true);
  });

  it("cancellation from queued", () => {
    const sm = new JobStateMachine("job-1");
    sm.transition("cancelled");
    expect(sm.isTerminal()).toBe(true);
  });

  it("cancellation from running", () => {
    const sm = new JobStateMachine("job-1", "running");
    sm.transition("cancelled");
    expect(sm.state).toBe("cancelled");
  });

  it("expiration from queued", () => {
    const sm = new JobStateMachine("job-1");
    sm.transition("expired");
    expect(sm.isTerminal()).toBe(true);
  });

  it("failure from running", () => {
    const sm = new JobStateMachine("job-1", "running");
    sm.transition("failed");
    expect(sm.state).toBe("failed");
  });

  it("dead letter from submitting", () => {
    const sm = new JobStateMachine("job-1", "submitting");
    sm.transition("dead_letter");
    expect(sm.state).toBe("dead_letter");
    expect(sm.isTerminal()).toBe(true);
  });

  it("cannot transition from terminal states", () => {
    const sm = new JobStateMachine("job-1", "completed");
    expect(() => sm.transition("running")).toThrow("Invalid job state transition");
  });

  it("rejects invalid transitions", () => {
    const sm = new JobStateMachine("job-1", "running");
    expect(() => sm.transition("claimed")).toThrow("Invalid job state transition");
  });

  it("isActive returns true for non-terminal states", () => {
    expect(new JobStateMachine("j", "running").isActive()).toBe(true);
    expect(new JobStateMachine("j", "completed").isActive()).toBe(false);
    expect(new JobStateMachine("j", "failed").isActive()).toBe(false);
  });
});
