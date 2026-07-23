/**
 * Production-capable helper state machine.
 * Replaces the previous minimal state machine while preserving all prior valid transitions.
 */

export type HelperState =
  | "unconfigured"
  | "unpaired"
  | "pairing"
  | "paired"
  | "connecting"
  | "ready"
  | "degraded"
  | "offline"
  | "credential_expired"
  | "credential_revoked"
  | "incompatible"
  | "error";

const HELPER_TRANSITIONS: Record<HelperState, readonly HelperState[]> = {
  unconfigured: ["unpaired", "pairing", "error"],
  unpaired: ["pairing", "error"],
  pairing: ["paired", "unpaired", "error"],
  paired: ["connecting", "ready", "unpaired", "error"],
  connecting: ["ready", "degraded", "offline", "credential_expired", "credential_revoked", "incompatible", "error"],
  ready: ["degraded", "offline", "credential_expired", "credential_revoked", "unpaired", "error"],
  degraded: ["ready", "offline", "credential_expired", "credential_revoked", "unpaired", "error"],
  offline: ["connecting", "ready", "degraded", "unpaired", "error"],
  credential_expired: ["pairing", "unpaired", "error"],
  credential_revoked: ["unpaired", "error"],
  incompatible: ["unpaired", "error"],
  error: ["unpaired", "connecting", "ready"]
};

export type StateChangeListener = (from: HelperState, to: HelperState) => void;

export class HelperStateMachine {
  private _state: HelperState;
  private readonly listeners: StateChangeListener[] = [];

  constructor(initial: HelperState = "unconfigured") {
    this._state = initial;
  }

  get state(): HelperState {
    return this._state;
  }

  canTransition(to: HelperState): boolean {
    return HELPER_TRANSITIONS[this._state].includes(to);
  }

  transition(to: HelperState): void {
    if (!this.canTransition(to)) {
      throw new Error(`Invalid helper state transition: ${this._state} → ${to}`);
    }
    const from = this._state;
    this._state = to;
    for (const listener of this.listeners) {
      listener(from, to);
    }
  }

  force(to: HelperState): void {
    const from = this._state;
    this._state = to;
    for (const listener of this.listeners) {
      listener(from, to);
    }
  }

  reset(): void {
    this.force("unpaired");
  }

  onChange(listener: StateChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  isReady(): boolean {
    return this._state === "ready";
  }

  isProcessingCapable(): boolean {
    return this._state === "ready" || this._state === "degraded";
  }

  isPaired(): boolean {
    return this._state === "paired" || this._state === "connecting" || this._state === "ready" || this._state === "degraded";
  }
}

// Job lifecycle state machine (separate from helper state)
export type JobLifecycleState =
  | "queued"
  | "claimed"
  | "leased"
  | "running"
  | "validating"
  | "submitting"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired"
  | "dead_letter";

const JOB_TRANSITIONS: Record<JobLifecycleState, readonly JobLifecycleState[]> = {
  queued: ["claimed", "cancelled", "expired"],
  claimed: ["leased", "cancelled", "expired", "failed"],
  leased: ["running", "cancelled", "expired", "failed"],
  running: ["validating", "failed", "cancelled"],
  validating: ["submitting", "failed"],
  submitting: ["completed", "failed", "dead_letter"],
  completed: [],
  failed: [],
  cancelled: [],
  expired: [],
  dead_letter: []
};

export class JobStateMachine {
  private _state: JobLifecycleState;
  readonly jobId: string;

  constructor(jobId: string, initial: JobLifecycleState = "queued") {
    this.jobId = jobId;
    this._state = initial;
  }

  get state(): JobLifecycleState {
    return this._state;
  }

  canTransition(to: JobLifecycleState): boolean {
    return JOB_TRANSITIONS[this._state].includes(to);
  }

  transition(to: JobLifecycleState): void {
    if (!this.canTransition(to)) {
      throw new Error(`Invalid job state transition: ${this._state} → ${to} (job ${this.jobId})`);
    }
    this._state = to;
  }

  isTerminal(): boolean {
    return this._state === "completed" || this._state === "failed" || this._state === "cancelled" || this._state === "expired" || this._state === "dead_letter";
  }

  isActive(): boolean {
    return !this.isTerminal();
  }
}

// Re-export legacy compatibility: `isProcessingCapable` from the old state machine
export function isProcessingCapable(state: HelperState): boolean {
  return state === "ready" || state === "degraded";
}
