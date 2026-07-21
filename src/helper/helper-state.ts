import type { PairingState } from "../contracts/v1/pairing.js";

const ALLOWED_TRANSITIONS: Record<PairingState, PairingState[]> = {
  unpaired: ["pairing"],
  pairing: ["paired_ready", "paired_disconnected", "unpaired", "error"],
  paired_disconnected: ["paired_ready", "degraded", "unpaired", "error"],
  paired_ready: ["processing", "paired_disconnected", "degraded", "unpaired", "error"],
  processing: ["paired_ready", "degraded", "error"],
  degraded: ["paired_ready", "paired_disconnected", "unpaired", "error"],
  error: ["unpaired", "paired_ready", "paired_disconnected"]
};

export class StateMachine {
  private _state: PairingState = "unpaired";

  get state(): PairingState {
    return this._state;
  }

  canTransition(to: PairingState): boolean {
    return ALLOWED_TRANSITIONS[this._state].includes(to);
  }

  transition(to: PairingState): void {
    if (!this.canTransition(to)) {
      throw new Error(`Invalid state transition: ${this._state} -> ${to}`);
    }
    this._state = to;
  }

  force(to: PairingState): void {
    this._state = to;
  }

  reset(): void {
    this._state = "unpaired";
  }
}

export function isProcessingCapable(state: PairingState): boolean {
  return state === "paired_ready";
}
