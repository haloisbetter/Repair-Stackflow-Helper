import { describe, it, expect } from "vitest";
import { authorizeToolUse, type ToolPolicy } from "../../src/tools/tool-authorization-service.js";
import { toolRegistry } from "../../src/tools/tool-registry.js";

const basePolicy: ToolPolicy = {
  organizationId: "dev",
  toolId: "format_technician_note",
  enabled: true,
  allowedRoles: ["workstation_agent", "ai_host", "combined"],
  requiresConfirmation: false,
  executionLocation: "local"
};

describe("authorizeToolUse", () => {
  it("authorizes a valid tool with matching policy", () => {
    const decision = authorizeToolUse({
      toolId: "format_technician_note",
      role: "workstation_agent",
      toolRegistry,
      enabledTools: ["format_technician_note"],
      policy: basePolicy,
      confirmationProvided: true
    });
    expect(decision.authorized).toBe(true);
  });

  it("rejects unknown tool", () => {
    const decision = authorizeToolUse({
      toolId: "nonexistent",
      role: "workstation_agent",
      toolRegistry,
      enabledTools: ["nonexistent"],
      policy: { ...basePolicy, toolId: "nonexistent" },
      confirmationProvided: true
    });
    expect(decision.authorized).toBe(false);
    expect(decision.errorCode).toBe("tool_not_found");
  });

  it("rejects unimplemented tool", () => {
    const decision = authorizeToolUse({
      toolId: "send_customer_message",
      role: "workstation_agent",
      toolRegistry,
      enabledTools: ["send_customer_message"],
      policy: { ...basePolicy, toolId: "send_customer_message" },
      confirmationProvided: true
    });
    expect(decision.authorized).toBe(false);
    expect(decision.errorCode).toBe("tool_not_implemented");
  });

  it("rejects tool not in enabled list", () => {
    const decision = authorizeToolUse({
      toolId: "format_technician_note",
      role: "workstation_agent",
      toolRegistry,
      enabledTools: [],
      policy: basePolicy,
      confirmationProvided: true
    });
    expect(decision.authorized).toBe(false);
    expect(decision.errorCode).toBe("tool_not_in_profile");
  });

  it("rejects when policy disabled", () => {
    const decision = authorizeToolUse({
      toolId: "format_technician_note",
      role: "workstation_agent",
      toolRegistry,
      enabledTools: ["format_technician_note"],
      policy: { ...basePolicy, enabled: false },
      confirmationProvided: true
    });
    expect(decision.authorized).toBe(false);
    expect(decision.errorCode).toBe("tool_disabled_by_policy");
  });

  it("rejects when role not in allowedRoles", () => {
    const decision = authorizeToolUse({
      toolId: "format_technician_note",
      role: "workstation_agent",
      toolRegistry,
      enabledTools: ["format_technician_note"],
      policy: { ...basePolicy, allowedRoles: ["ai_host"] },
      confirmationProvided: true
    });
    expect(decision.authorized).toBe(false);
    expect(decision.errorCode).toBe("tool_role_not_allowed");
  });

  it("rejects unsupported execution location", () => {
    const decision = authorizeToolUse({
      toolId: "format_technician_note",
      role: "workstation_agent",
      toolRegistry,
      enabledTools: ["format_technician_note"],
      policy: { ...basePolicy, executionLocation: "repair_stackflow" },
      confirmationProvided: true
    });
    expect(decision.authorized).toBe(false);
    expect(decision.errorCode).toBe("tool_location_not_supported");
  });

  it("rejects when confirmation required but not provided", () => {
    const decision = authorizeToolUse({
      toolId: "format_technician_note",
      role: "workstation_agent",
      toolRegistry,
      enabledTools: ["format_technician_note"],
      policy: { ...basePolicy, requiresConfirmation: true },
      confirmationProvided: false
    });
    expect(decision.authorized).toBe(false);
    expect(decision.errorCode).toBe("tool_confirmation_required");
  });

  it("authorizes when confirmation required and provided", () => {
    const decision = authorizeToolUse({
      toolId: "format_technician_note",
      role: "workstation_agent",
      toolRegistry,
      enabledTools: ["format_technician_note"],
      policy: { ...basePolicy, requiresConfirmation: true },
      confirmationProvided: true
    });
    expect(decision.authorized).toBe(true);
  });

  it("allows any role when allowedRoles is empty", () => {
    const decision = authorizeToolUse({
      toolId: "format_technician_note",
      role: "combined",
      toolRegistry,
      enabledTools: ["format_technician_note"],
      policy: { ...basePolicy, allowedRoles: [] },
      confirmationProvided: true
    });
    expect(decision.authorized).toBe(true);
  });
});
