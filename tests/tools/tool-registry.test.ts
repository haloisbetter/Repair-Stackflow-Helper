import { describe, it, expect } from "vitest";
import { ToolRegistry, toolRegistry, TOOL_DEFINITIONS } from "../../src/tools/tool-registry.js";

describe("ToolRegistry", () => {
  it("registers exactly 12 tools", () => {
    expect(TOOL_DEFINITIONS).toHaveLength(12);
  });

  it("only format_technician_note is implemented", () => {
    const implemented = TOOL_DEFINITIONS.filter((t) => t.implemented);
    expect(implemented).toHaveLength(1);
    expect(implemented[0]?.toolId).toBe("format_technician_note");
  });

  it("resolves a known tool", () => {
    const tool = toolRegistry.resolve("format_technician_note");
    expect(tool).not.toBeNull();
    expect(tool?.displayName).toBe("Format Technician Note");
  });

  it("returns null for unknown tool", () => {
    expect(toolRegistry.resolve("nonexistent_tool")).toBeNull();
  });

  it("isImplemented returns true only for format_technician_note", () => {
    expect(toolRegistry.isImplemented("format_technician_note")).toBe(true);
    expect(toolRegistry.isImplemented("draft_customer_update")).toBe(false);
    expect(toolRegistry.isImplemented("nonexistent")).toBe(false);
  });

  it("list returns all 12 tools", () => {
    expect(toolRegistry.list()).toHaveLength(12);
  });

  it("all required tool IDs are registered", () => {
    const requiredIds = [
      "format_technician_note",
      "draft_customer_update",
      "extract_checkin_fields",
      "draft_symptom_summary",
      "suggest_next_question",
      "search_internal_knowledge",
      "lookup_customer",
      "lookup_work_order",
      "create_checkin_draft",
      "build_estimate",
      "lookup_parts",
      "send_customer_message"
    ];
    for (const id of requiredIds) {
      expect(toolRegistry.resolve(id)).not.toBeNull();
    }
  });

  it("every tool has a valid category and riskLevel", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(["note_formatting", "drafting", "extraction", "knowledge", "lookup", "creation", "estimation", "communication"]).toContain(tool.category);
      expect(["low", "medium", "high"]).toContain(tool.riskLevel);
      expect(["local", "repair_stackflow", "hybrid"]).toContain(tool.executionLocation);
    }
  });
});
