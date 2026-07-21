import { useEffect, useState } from "react";
import type { ToolWithPolicy } from "../../app/api-client.js";
import { api } from "../../app/api-client.js";
import { ToolRow } from "./ToolRow.js";

interface Props {
  onRefresh: () => void;
}

export function ToolSettings({ onRefresh }: Props) {
  const [tools, setTools] = useState<ToolWithPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.listTools()
      .then((res) => { if (!cancelled) setTools(res.tools); })
      .catch((e) => { if (!cancelled) setMessage(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleToggle = async (toolId: string, enabled: boolean) => {
    try {
      await api.updateToolPolicy(toolId, { enabled });
      const res = await api.listTools();
      setTools(res.tools);
      onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="settings-section">
      <h3 className="settings-heading">Tools</h3>
      {loading && <p className="settings-note">Loading tools…</p>}
      {!loading && tools.map((t) => (
        <ToolRow
          key={t.toolId}
          tool={t}
          policy={t.policy}
          onToggle={handleToggle}
        />
      ))}
      {message && <div className="settings-message">{message}</div>}
    </div>
  );
}
