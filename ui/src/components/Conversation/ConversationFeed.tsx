import { useEffect, useRef } from "react";
import type { ConversationItem } from "../../app/app-state.js";
import { MessageBubble } from "./MessageBubble.js";

interface Props {
  items: ConversationItem[];
  onChipClick: (chip: string) => void;
  onCopy: (text: string, label: string) => void;
}

export function ConversationFeed({ items, onChipClick, onCopy }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [items]);

  return (
    <div className="conversation-feed" role="log" aria-live="polite" aria-label="Conversation">
      {items.map((item) => (
        <MessageBubble key={item.id} item={item} onChipClick={onChipClick} onCopy={onCopy} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
