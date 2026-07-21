import { useState } from "react";
import type { RuntimeAssistantConfiguration } from "../../app/api-client.js";
import { api } from "../../app/api-client.js";

interface Props {
  runtime: RuntimeAssistantConfiguration | null;
  onRefresh: () => void;
}

export function InstructionProfileSettings({ runtime, onRefresh }: Props) {
  const profile = runtime?.instructions ?? null;
  const [globalInstructions, setGlobalInstructions] = useState(
    profile?.globalInstructions ?? ""
  );
  const [toneRules, setToneRules] = useState(profile?.toneRules.join("\n") ?? "");
  const [formattingRules, setFormattingRules] = useState(profile?.formattingRules.join("\n") ?? "");
  const [prohibitedClaims, setProhibitedClaims] = useState(profile?.prohibitedClaims.join("\n") ?? "");
  const [escalationRules, setEscalationRules] = useState(profile?.escalationRules.join("\n") ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const splitLines = (s: string): string[] =>
    s.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateInstructionProfile({
        globalInstructions,
        toneRules: splitLines(toneRules),
        formattingRules: splitLines(formattingRules),
        prohibitedClaims: splitLines(prohibitedClaims),
        escalationRules: splitLines(escalationRules),
        profileVersion: (profile?.profileVersion ?? 0) + 1
      });
      setMessage("Instruction profile saved.");
      onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-section">
      <h3 className="settings-heading">Instruction Profile</h3>
      <label className="settings-label">Global Instructions</label>
      <textarea className="settings-textarea" value={globalInstructions} onChange={(e) => setGlobalInstructions(e.target.value)} maxLength={2000} rows={4} />
      <label className="settings-label">Tone Rules (one per line)</label>
      <textarea className="settings-textarea" value={toneRules} onChange={(e) => setToneRules(e.target.value)} rows={3} />
      <label className="settings-label">Formatting Rules (one per line)</label>
      <textarea className="settings-textarea" value={formattingRules} onChange={(e) => setFormattingRules(e.target.value)} rows={3} />
      <label className="settings-label">Prohibited Claims (one per line)</label>
      <textarea className="settings-textarea" value={prohibitedClaims} onChange={(e) => setProhibitedClaims(e.target.value)} rows={3} />
      <label className="settings-label">Escalation Rules (one per line)</label>
      <textarea className="settings-textarea" value={escalationRules} onChange={(e) => setEscalationRules(e.target.value)} rows={3} />
      <div className="settings-actions">
        <button className="settings-btn" onClick={handleSave} disabled={saving}>Save Instructions</button>
      </div>
      {message && <div className="settings-message">{message}</div>}
    </div>
  );
}
