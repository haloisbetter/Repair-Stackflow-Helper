import type { ConversationItem } from "../../app/app-state.js";

interface Props {
  item: ConversationItem;
  onChipClick: (chip: string) => void;
  onCopy: (text: string, label: string) => void;
}

export function MessageBubble({ item, onChipClick, onCopy }: Props) {
  const time = new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  switch (item.type) {
    case "helper-message":
      return (
        <div className="msg helper-msg" role="article">
          <div className="msg-avatar" aria-hidden="true">H</div>
          <div className="msg-body">
            <div className="msg-text">{item.content}</div>
            <div className="msg-time">{time}</div>
          </div>
        </div>
      );

    case "user-input":
      return (
        <div className="msg user-msg" role="article">
          <div className="msg-body">
            <div className="msg-text">{item.content}</div>
            <div className="msg-time">{time}</div>
          </div>
          <div className="msg-avatar user" aria-hidden="true">T</div>
        </div>
      );

    case "status-notification":
      return (
        <div className="msg status-msg" role="status" aria-live="polite">
          <div className="msg-body">
            <div className="msg-text status-text">{item.content}</div>
            <div className="msg-time">{time}</div>
          </div>
        </div>
      );

    case "warning-card":
      return (
        <div className="msg warning-card" role="alert">
          <div className="card-title">{item.title}</div>
          <div className="card-content">{item.content}</div>
        </div>
      );

    case "error-card":
      return (
        <div className="msg error-card" role="alert">
          <div className="card-title">{item.title}</div>
          <div className="card-content">{item.content}</div>
          {item.chips && (
            <div className="chip-row">
              {item.chips.map((c) => (
                <button key={c} className="chip" onClick={() => onChipClick(c)}>{c}</button>
              ))}
            </div>
          )}
        </div>
      );

    case "processing":
      return (
        <div className="msg processing-msg" role="status" aria-live="polite">
          <div className="msg-avatar" aria-hidden="true">H</div>
          <div className="msg-body">
            <div className="msg-text">
              <span className="typing-dots" aria-hidden="true">
                <span /> <span /> <span />
              </span>
              {item.content}
            </div>
          </div>
        </div>
      );

    case "action-chips":
      return (
        <div className="msg chip-container" role="navigation" aria-label="Suggested actions">
          {item.chips?.map((c) => (
            <button key={c} className="chip" onClick={() => onChipClick(c)}>{c}</button>
          ))}
        </div>
      );

    case "result-card": {
      if (!item.result) return null;
      const r = item.result.result;
      const isMock = item.result.provider === "mock";
      return (
        <div className="msg result-card" role="article">
          <div className="result-card-header">
            <span className="result-card-title">Formatted Technician Note</span>
            {isMock && <span className="dev-badge">DEV MOCK</span>}
          </div>
          <div className="result-section">
            <div className="result-label">Formatted Note</div>
            <div className="result-value formatted-note">{r.formattedNote}</div>
            <button
              className="copy-btn"
              onClick={() => onCopy(r.formattedNote, "formatted note")}
              aria-label="Copy formatted note"
            >
              Copy
            </button>
          </div>
          {r.customerReportedIssue && (
            <div className="result-section">
              <div className="result-label">Customer Reported Issue</div>
              <div className="result-value">{r.customerReportedIssue}</div>
            </div>
          )}
          {r.technicianFindings.length > 0 && (
            <div className="result-section">
              <div className="result-label">Technician Findings</div>
              <ul className="result-list">
                {r.technicianFindings.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
          {r.recommendedNextStep && (
            <div className="result-section">
              <div className="result-label">Recommended Next Step</div>
              <div className="result-value">{r.recommendedNextStep}</div>
            </div>
          )}
          {r.warnings.length > 0 && (
            <div className="result-section warnings-section">
              <div className="result-label">Warnings</div>
              <ul className="result-list warnings-list">
                {r.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          <div className="result-card-footer">
            <span className="result-provider">Provider: {item.result.provider}</span>
            <button
              className="copy-btn"
              onClick={() => onCopy(JSON.stringify(r, null, 2), "structured result")}
              aria-label="Copy full structured result"
            >
              Copy all
            </button>
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}
