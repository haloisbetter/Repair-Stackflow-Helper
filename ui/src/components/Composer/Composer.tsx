import { useRef, useState, type KeyboardEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder?: string;
  maxLength?: number;
}

export function Composer({ onSend, disabled, placeholder, maxLength = 4096 }: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showCount = text.length > maxLength * 0.85;
  const overLimit = text.length > maxLength;

  return (
    <div className="composer" role="form" aria-label="Message composer">
      <textarea
        ref={textareaRef}
        className="composer-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? "Type a technician note or choose an action…"}
        disabled={disabled}
        maxLength={maxLength}
        rows={2}
        aria-label="Technician note input"
        aria-describedby="composer-hint"
      />
      <div className="composer-actions">
        <span className="composer-hint" id="composer-hint">
          {disabled
            ? "Processing…"
            : overLimit
              ? "Note too long"
              : showCount
                ? `${text.length} / ${maxLength}`
                : "Enter to send · Shift+Enter for new line"}
        </span>
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={disabled || !text.trim() || overLimit}
          aria-label="Send"
        >
          Send
        </button>
      </div>
      <div className="composer-attachment" aria-label="Attachment (coming later)" title="Attachments coming later">
        <span className="attachment-icon" aria-hidden="true">📎</span>
      </div>
    </div>
  );
}
