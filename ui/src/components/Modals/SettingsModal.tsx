import { useState } from "react";
import { Modal } from "./Modal.js";
import type { BootstrapResponse } from "../../app/api-client.js";
import { api } from "../../app/api-client.js";

interface Props {
  bootstrap: BootstrapResponse | null;
  onClose: () => void;
  onRefresh: () => void;
}

export function SettingsModal({ bootstrap, onClose, onRefresh }: Props) {
  const [ollamaEndpoint, setOllamaEndpoint] = useState(bootstrap?.config.ollamaEndpoint ?? "http://127.0.0.1:11434");
  const [approvedModel, setApprovedModel] = useState(bootstrap?.config.approvedModel ?? "llama3.2");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateConfig({ ollamaEndpoint, approvedModel });
      setMessage("Settings saved.");
      onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setSaving(true);
    try {
      const result = await api.testAi();
      setMessage(
        result.ollamaReachable && result.modelAvailable
          ? `Ollama reachable. Model available. ${result.latencyMs}ms.`
          : `Ollama unavailable: ${result.detail ?? "not reachable"}`
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleUnpair = async () => {
    try {
      await api.unpair();
      onRefresh();
      onClose();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="settings-section">
        <h3 className="settings-heading">General</h3>
        <div className="settings-row"><span>Helper name</span><span className="settings-value">{bootstrap?.identity.helperName ?? "—"}</span></div>
        <div className="settings-row"><span>Role</span><span className="settings-value">{bootstrap?.identity.role ?? "—"}</span></div>
        <div className="settings-row"><span>Organization</span><span className="settings-value">{bootstrap?.lastPairing?.locationName ?? bootstrap?.identity.organizationId ?? "—"}</span></div>
        <div className="settings-row"><span>Pairing</span><span className="settings-value">{bootstrap?.identity.pairingState ?? "—"}</span></div>
        <button className="settings-btn danger" onClick={handleUnpair}>Unpair</button>
      </div>

      <div className="settings-section">
        <h3 className="settings-heading">AI</h3>
        <label className="settings-label">Ollama Endpoint</label>
        <input className="settings-input" value={ollamaEndpoint} onChange={(e) => setOllamaEndpoint(e.target.value)} />
        <label className="settings-label">Approved Model</label>
        <input className="settings-input" value={approvedModel} onChange={(e) => setApprovedModel(e.target.value)} />
        <div className="settings-actions">
          <button className="settings-btn" onClick={handleTest} disabled={saving}>Test Connection</button>
          <button className="settings-btn" onClick={handleSave} disabled={saving}>Save</button>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-heading">Privacy</h3>
        <p className="settings-note">
          Temporary results are stored in memory only and cleared when the Helper stops.
          The Repair StackFlow web app remains the permanent system of record.
          Results must be copied into Repair StackFlow manually.
        </p>
        <button className="settings-btn" onClick={async () => { await api.clear(); onRefresh(); }}>Clear Temporary Data</button>
      </div>

      {message && <div className="settings-message">{message}</div>}
    </Modal>
  );
}
