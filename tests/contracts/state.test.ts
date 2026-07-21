import { describe, it, expect } from "vitest";
import { StateMachine, isProcessingCapable } from "../../src/helper/helper-state.js";

describe("state machine", () => {
  it("starts unpaired", () => {
    const sm = new StateMachine();
    expect(sm.state).toBe("unpaired");
  });

  it("allows unpaired -> pairing", () => {
    const sm = new StateMachine();
    sm.transition("pairing");
    expect(sm.state).toBe("pairing");
  });

  it("rejects invalid transitions", () => {
    const sm = new StateMachine();
    expect(() => sm.transition("processing")).toThrow();
  });

  it("supports state restoration rules", () => {
    const sm = new StateMachine();
    sm.transition("pairing");
    sm.force("paired_ready");
    expect(sm.state).toBe("paired_ready");
    sm.transition("processing");
    sm.transition("paired_ready");
    expect(sm.state).toBe("paired_ready");
  });

  it("isProcessingCapable only in paired_ready", () => {
    expect(isProcessingCapable("paired_ready")).toBe(true);
    expect(isProcessingCapable("unpaired")).toBe(false);
    expect(isProcessingCapable("processing")).toBe(false);
  });
});
