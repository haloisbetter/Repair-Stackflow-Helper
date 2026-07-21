import type { HealthSummary } from "../../app/api-client.js";

interface Props {
  health: HealthSummary | null;
  providerSelection: string;
  approvedModel: string;
}

export function StatusIndicator({ health, providerSelection, approvedModel }: Props) {
  const state = health?.state ?? "unknown";
  const dotClass =
    state === "ready"
      ? "status-dot ready"
      : state === "degraded"
        ? "status-dot degraded"
        : "status-dot unavailable";

  const label =
    state === "ready" ? "Ready" : state === "degraded" ? "Degraded" : state === "unavailable" ? "Unavailable" : "Unknown";

  const providerLabel =
    providerSelection === "mock"
      ? "Mock Provider"
      : providerSelection === "ollama"
        ? `Local Ollama · ${approvedModel}`
        : `Local Ollama · ${approvedModel}`;

  const subtitle =
    providerSelection === "mock"
      ? "Mock Provider"
      : health && !health.ollamaReachable
        ? "Ollama unavailable"
        : providerLabel;

  return (
    <div className="status-indicator" role="status" aria-live="polite">
      <span className={dotClass} aria-hidden="true" />
      <span className="status-label">{label}</span>
      <span className="status-subtitle">{subtitle}</span>
    </div>
  );
}
