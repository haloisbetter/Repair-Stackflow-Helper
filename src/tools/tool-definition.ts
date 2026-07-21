export type ToolCategory =
  | "note_formatting"
  | "drafting"
  | "extraction"
  | "knowledge"
  | "lookup"
  | "creation"
  | "estimation"
  | "communication";

export type ExecutionLocation = "local" | "repair_stackflow" | "hybrid";

export type RiskLevel = "low" | "medium" | "high";

export interface ToolDefinition {
  toolId: string;
  displayName: string;
  description: string;
  category: ToolCategory;
  executionLocation: ExecutionLocation;
  riskLevel: RiskLevel;
  implemented: boolean;
}
