import type { ToolDefinition, ToolPolicy } from "../../app/api-client.js";

interface Props {
  tool: ToolDefinition;
  policy: ToolPolicy | null;
  onToggle: (toolId: string, enabled: boolean) => void;
}

export function ToolRow({ tool, policy, onToggle }: Props) {
  const enabled = policy?.enabled ?? false;
  const statusClass = !tool.implemented
    ? "tool-status not-implemented"
    : enabled
      ? "tool-status enabled"
      : "tool-status disabled";

  const statusLabel = !tool.implemented
    ? "Not implemented"
    : enabled
      ? "Enabled"
      : "Disabled";

  return (
    <div className="tool-row">
      <div className="tool-row-info">
        <div className="tool-row-name">{tool.displayName}</div>
        <div className="tool-row-desc">{tool.description}</div>
        <div className="tool-row-meta">
          <span className={`tool-risk risk-${tool.riskLevel}`}>{tool.riskLevel} risk</span>
          <span className="tool-location">{tool.executionLocation}</span>
        </div>
      </div>
      <div className="tool-row-controls">
        <span className={statusClass}>{statusLabel}</span>
        {tool.implemented && (
          <label className="tool-toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggle(tool.toolId, e.target.checked)}
            />
            <span />
          </label>
        )}
      </div>
    </div>
  );
}
