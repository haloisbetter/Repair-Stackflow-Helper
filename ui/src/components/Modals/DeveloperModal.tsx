import { useState } from "react";
import { Modal } from "./Modal.js";
import type { DeveloperStatus, BootstrapResponse } from "../../app/api-client.js";
import { api } from "../../app/api-client.js";

interface Props {
  status: DeveloperStatus | null;
  bootstrap?: BootstrapResponse | null;
  onClose: () => void;
  onRefresh: () => void;
}

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="dev-section">
      <button className="dev-section-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="dev-section-chevron" aria-hidden="true">{open ? "▼" : "▶"}</span>
        {title}
      </button>
      {open && <div className="dev-section-body">{children}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="dev-row"><span className="dev-label">{label}</span><span className="dev-value">{value ?? "—"}</span></div>
  );
}

export function DeveloperModal({ status, bootstrap, onClose, onRefresh }: Props) {
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [configMsg, setConfigMsg] = useState<string | null>(null);

  const handleCopyDiagnostics = async () => {
    try {
      const diag = await api.diagnostics();
      const text = JSON.stringify(diag, null, 2);
      await navigator.clipboard.writeText(text);
      setCopyMsg("Copied sanitized diagnostics to clipboard.");
      setTimeout(() => setCopyMsg(null), 3000);
    } catch {
      setCopyMsg("Copy failed.");
    }
  };

  const handleReset = async () => {
    await api.developerReset();
    onRefresh();
  };

  const handlePair = async () => {
    await api.pair("DEV-YORKTOWN");
    onRefresh();
  };

  const handleSelectMock = async () => {
    await api.selectProvider("mock");
    onRefresh();
  };

  const handleSelectOllama = async () => {
    await api.selectProvider("ollama");
    onRefresh();
  };

  const handleExport = async () => {
    try {
      const config = await api.exportConfiguration();
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "helper-configuration.json";
      a.click();
      URL.revokeObjectURL(url);
      setConfigMsg("Configuration exported.");
      setTimeout(() => setConfigMsg(null), 3000);
    } catch (e) {
      setConfigMsg(e instanceof Error ? e.message : "Export failed.");
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await api.importConfiguration(parsed);
      setConfigMsg("Configuration imported successfully.");
      onRefresh();
    } catch (e) {
      setConfigMsg(e instanceof Error ? e.message : "Import failed.");
    }
  };

  const handleResetConfig = async () => {
    try {
      await api.resetConfiguration();
      setConfigMsg("Configuration reset to safe defaults.");
      onRefresh();
    } catch (e) {
      setConfigMsg(e instanceof Error ? e.message : "Reset failed.");
    }
  };

  return (
    <Modal title="Developer" onClose={onClose} wide>
      <div className="dev-container">
        <Section title="Runtime" defaultOpen={true}>
          <Row label="App version" value={status?.runtime.appVersion ?? null} />
          <Row label="Environment" value={status?.runtime.environment ?? null} />
          <Row label="Bind host" value={status?.runtime.host ?? null} />
          <Row label="Port" value={status?.runtime.port ?? null} />
          <Row label="Platform" value={status?.runtime.platform ?? null} />
          <Row label="Architecture" value={status?.runtime.architecture ?? null} />
          <Row label="Uptime" value={status?.runtime.uptimeMs ? `${Math.floor(status.runtime.uptimeMs / 1000)}s` : null} />
        </Section>

        <Section title="Helper Identity">
          <Row label="Helper ID" value={status?.identity.helperId ?? null} />
          <Row label="Helper name" value={status?.identity.helperName ?? null} />
          <Row label="Role" value={status?.identity.role ?? null} />
          <Row label="Pairing state" value={status?.identity.pairingState ?? null} />
          <Row label="Organization ID" value={status?.identity.organizationId ?? null} />
          <Row label="Location ID" value={status?.identity.locationId ?? null} />
        </Section>

        <Section title="AI Runtime">
          <Row label="Execution target" value={status?.aiRuntime.executionTarget ?? null} />
          <Row label="Selected provider" value={status?.aiRuntime.selectedProvider ?? null} />
          <Row label="Ollama endpoint" value={status?.aiRuntime.ollamaEndpoint ?? null} />
          <Row label="Approved model" value={status?.aiRuntime.approvedModel ?? null} />
          <Row label="Endpoint status" value={status?.aiRuntime.endpointStatus ?? null} />
          <Row label="Model status" value={status?.aiRuntime.modelStatus ?? null} />
          <Row label="Last health check" value={status?.aiRuntime.lastHealthCheck ?? null} />
          <Row label="Response latency" value={status?.aiRuntime.responseLatencyMs != null ? `${status.aiRuntime.responseLatencyMs}ms` : null} />
        </Section>

        <Section title="Jobs">
          <Row label="Active job ID" value={status?.jobs.activeJobId ?? null} />
          <Row label="Last completed job ID" value={status?.jobs.lastCompletedJobId ?? null} />
          <Row label="Last task" value={status?.jobs.lastTask ?? null} />
          <Row label="Temporary result count" value={status?.jobs.temporaryResultCount ?? null} />
          <Row label="Failure count" value={status?.jobs.failureCount ?? null} />
          <Row label="Last error code" value={status?.jobs.lastErrorCode ?? null} />
          <button className="dev-btn" onClick={handleReset}>Clear Job State</button>
        </Section>

        <Section title="Diagnostics">
          <Row label="Provider health" value={status?.diagnostics.providerHealth ?? null} />
          <Row label="Model availability" value={status?.diagnostics.modelAvailability ? "yes" : "no"} />
          <Row label="Active job ID" value={status?.diagnostics.activeJobId ?? null} />
          <Row label="Task name" value={status?.diagnostics.taskName ?? null} />
          <Row label="Error code" value={status?.diagnostics.errorCode ?? null} />
          <button className="dev-btn" onClick={handleCopyDiagnostics}>Copy Sanitized Diagnostics</button>
          {copyMsg && <div className="dev-message">{copyMsg}</div>}
        </Section>

        <Section title="Development Controls">
          <div className="dev-controls">
            <button className="dev-btn" onClick={handlePair}>Dev Pair (DEV-YORKTOWN)</button>
            <button className="dev-btn" onClick={async () => { await api.unpair(); onRefresh(); }}>Unpair</button>
            <button className="dev-btn" onClick={handleSelectMock}>Select Mock Provider</button>
            <button className="dev-btn" onClick={handleSelectOllama}>Select Ollama</button>
            <button className="dev-btn" onClick={handleReset}>Reset Helper State</button>
          </div>
          <p className="dev-note">
            Simulation controls are available in development mode only.
            Technician-note content is never shown in developer diagnostics.
          </p>
        </Section>

        <Section title="Configuration" defaultOpen={true}>
          <Row label="Configuration loaded" value={bootstrap?.configuration?.loaded ? "yes" : "no"} />
          <Row label="Schema version" value={bootstrap?.configuration?.schemaVersion ?? "—"} />
          <Row label="Source" value={bootstrap?.configuration?.source ?? "—"} />
          <Row label="Last saved" value={bootstrap?.configuration?.lastSave ?? "—"} />
          <Row label="Persistence healthy" value={bootstrap?.configuration?.persistenceHealthy ? "yes" : "no"} />
          <Row label="Last error code" value={bootstrap?.configuration?.lastPersistenceErrorCode ?? "—"} />
          {bootstrap?.configuration?.warning && (
            <div className="dev-message dev-warning">{bootstrap.configuration.warning}</div>
          )}
          <div className="dev-controls">
            <button className="dev-btn" onClick={handleExport}>Export Configuration</button>
            <label className="dev-btn dev-import-btn">
              Import Configuration
              <input type="file" accept=".json,application/json" onChange={handleImportFile} style={{ display: "none" }} />
            </label>
            <button className="dev-btn" onClick={handleResetConfig}>Reset to Safe Defaults</button>
          </div>
          {configMsg && <div className="dev-message">{configMsg}</div>}
        </Section>

        <Section title="Assistant Profile">
          <Row label="Name" value={bootstrap?.assistant?.name ?? null} />
          <Row label="Subtitle" value={bootstrap?.assistant?.subtitle ?? null} />
          <Row label="Profile version" value={String(bootstrap?.assistant?.profileVersion ?? "—")} />
          <Row label="Avatar" value={bootstrap?.assistant?.avatar?.value ?? null} />
          <Row label="Accent color" value={bootstrap?.assistant?.appearance?.accentColor ?? null} />
        </Section>

        <Section title="Instruction Profile">
          <Row label="Profile version" value={String(bootstrap?.runtimeConfig?.instructions?.profileVersion ?? "—")} />
          <Row label="Tone rules" value={String(bootstrap?.runtimeConfig?.instructions?.toneRules?.length ?? 0)} />
          <Row label="Formatting rules" value={String(bootstrap?.runtimeConfig?.instructions?.formattingRules?.length ?? 0)} />
          <Row label="Prohibited claims" value={String(bootstrap?.runtimeConfig?.instructions?.prohibitedClaims?.length ?? 0)} />
          <Row label="Escalation rules" value={String(bootstrap?.runtimeConfig?.instructions?.escalationRules?.length ?? 0)} />
        </Section>

        <Section title="Tool Runtime">
          <Row label="Enabled tools" value={bootstrap?.runtimeConfig?.enabledTools?.join(", ") ?? null} />
          <Row label="Model role" value={bootstrap?.runtimeConfig?.modelRole ?? null} />
          <Row label="Compiled at" value={bootstrap?.runtimeConfig?.compiledAt ?? null} />
        </Section>

        <Section title="Runtime Configuration">
          <Row label="Organization ID" value={bootstrap?.runtimeConfig?.organizationId ?? null} />
          <Row label="Welcome message" value={bootstrap?.assistant?.welcomeMessage ?? null} />
        </Section>
      </div>
    </Modal>
  );
}
