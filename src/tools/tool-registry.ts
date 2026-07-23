import type { ToolDefinition } from "./tool-definition.js";

const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    toolId: "format_technician_note",
    displayName: "Format Technician Note",
    description: "Convert a rough technician note into a structured, professional repair note.",
    category: "note_formatting",
    executionLocation: "local",
    riskLevel: "low",
    implemented: true
  },
  {
    toolId: "draft_customer_update",
    displayName: "Draft Customer Update",
    description: "Draft a customer-facing status update from repair progress notes.",
    category: "drafting",
    executionLocation: "local",
    riskLevel: "medium",
    implemented: true
  },
  {
    toolId: "extract_checkin_fields",
    displayName: "Extract Check-in Fields",
    description: "Extract structured check-in fields from a transcribed customer conversation.",
    category: "extraction",
    executionLocation: "local",
    riskLevel: "medium",
    implemented: true
  },
  {
    toolId: "summarize_checkin_symptoms",
    displayName: "Summarize Check-in Symptoms",
    description: "Summarize reported symptoms into a concise diagnostic summary for check-in.",
    category: "drafting",
    executionLocation: "local",
    riskLevel: "low",
    implemented: true
  },
  {
    toolId: "suggest_next_question",
    displayName: "Suggest Next Question",
    description: "Suggest the next diagnostic question based on current findings.",
    category: "knowledge",
    executionLocation: "local",
    riskLevel: "low",
    implemented: false
  },
  {
    toolId: "search_internal_knowledge",
    displayName: "Search Internal Knowledge",
    description: "Search internal repair knowledge base for relevant procedures.",
    category: "knowledge",
    executionLocation: "repair_stackflow",
    riskLevel: "low",
    implemented: false
  },
  {
    toolId: "lookup_customer",
    displayName: "Lookup Customer",
    description: "Look up a customer record by name, phone, or email.",
    category: "lookup",
    executionLocation: "repair_stackflow",
    riskLevel: "medium",
    implemented: false
  },
  {
    toolId: "lookup_work_order",
    displayName: "Lookup Work Order",
    description: "Look up a work order by number or customer reference.",
    category: "lookup",
    executionLocation: "repair_stackflow",
    riskLevel: "medium",
    implemented: false
  },
  {
    toolId: "create_checkin_draft",
    displayName: "Create Check-in Draft",
    description: "Create a draft check-in record in Repair StackFlow.",
    category: "creation",
    executionLocation: "repair_stackflow",
    riskLevel: "high",
    implemented: false
  },
  {
    toolId: "build_estimate",
    displayName: "Build Estimate",
    description: "Build a repair cost estimate from parts and labor inputs.",
    category: "estimation",
    executionLocation: "hybrid",
    riskLevel: "medium",
    implemented: false
  },
  {
    toolId: "lookup_parts",
    displayName: "Lookup Parts",
    description: "Look up parts inventory and pricing from the parts catalog.",
    category: "lookup",
    executionLocation: "repair_stackflow",
    riskLevel: "low",
    implemented: false
  },
  {
    toolId: "send_customer_message",
    displayName: "Send Customer Message",
    description: "Send a message to a customer through Repair StackFlow.",
    category: "communication",
    executionLocation: "repair_stackflow",
    riskLevel: "high",
    implemented: false
  }
];

const TOOL_MAP: ReadonlyMap<string, ToolDefinition> = new Map(
  TOOL_DEFINITIONS.map((t) => [t.toolId, t])
);

export class ToolRegistry {
  private readonly tools: ReadonlyMap<string, ToolDefinition>;

  constructor(definitions: readonly ToolDefinition[] = TOOL_DEFINITIONS) {
    this.tools = new Map(definitions.map((t) => [t.toolId, t]));
  }

  resolve(toolId: string): ToolDefinition | null {
    return this.tools.get(toolId) ?? null;
  }

  isImplemented(toolId: string): boolean {
    const tool = this.tools.get(toolId);
    return tool?.implemented ?? false;
  }

  list(): readonly ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}

export const toolRegistry = new ToolRegistry();

export { TOOL_DEFINITIONS };
