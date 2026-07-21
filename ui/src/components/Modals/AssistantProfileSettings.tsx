import { useState } from "react";
import type { AssistantProfile, RuntimeAssistantConfiguration } from "../../app/api-client.js";
import { api } from "../../app/api-client.js";

interface Props {
  runtime: RuntimeAssistantConfiguration | null;
  onRefresh: () => void;
}

export function AssistantProfileSettings({ runtime, onRefresh }: Props) {
  const profile = runtime?.assistant ?? null;
  const [name, setName] = useState(profile?.name ?? "Helper");
  const [subtitle, setSubtitle] = useState(profile?.subtitle ?? "Repair Assistant");
  const [welcomeMessage, setWelcomeMessage] = useState(profile?.welcomeMessage ?? "Ready to help with today's repairs.");
  const [avatar, setAvatar] = useState(profile?.avatar?.value ?? "H");
  const [accentColor, setAccentColor] = useState(profile?.appearance?.accentColor ?? "#2f8f83");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateAssistantProfile({
        name,
        subtitle,
        welcomeMessage,
        avatar: { type: "initials", value: avatar },
        appearance: { accentColor },
        profileVersion: (profile?.profileVersion ?? 0) + 1
      });
      setMessage("Assistant profile saved.");
      onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await api.resetAssistantProfile();
      setMessage("Assistant profile reset to defaults.");
      onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-section">
      <h3 className="settings-heading">Assistant Profile</h3>
      <label className="settings-label">Name</label>
      <input className="settings-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      <label className="settings-label">Subtitle</label>
      <input className="settings-input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={80} />
      <label className="settings-label">Welcome Message</label>
      <textarea className="settings-textarea" value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} maxLength={300} rows={3} />
      <label className="settings-label">Avatar Initials</label>
      <input className="settings-input" value={avatar} onChange={(e) => setAvatar(e.target.value)} maxLength={3} />
      <label className="settings-label">Accent Color</label>
      <input className="settings-input" type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
      <div className="settings-actions">
        <button className="settings-btn" onClick={handleSave} disabled={saving}>Save Profile</button>
        <button className="settings-btn" onClick={handleReset} disabled={saving}>Reset to Defaults</button>
      </div>
      {message && <div className="settings-message">{message}</div>}
    </div>
  );
}
