export type ConversationIntent =
  | "welcome"
  | "format_technician_note"
  | "test_ai_connection"
  | "view_status"
  | "clear_conversation"
  | "open_settings";

export interface ConversationItem {
  id: string;
  type:
    | "helper-message"
    | "status-notification"
    | "user-input"
    | "result-card"
    | "warning-card"
    | "error-card"
    | "confirmation-card"
    | "action-chips"
    | "processing";
  content?: string;
  result?: import("../app/api-client.js").JobResult;
  chips?: string[];
  title?: string;
  timestamp: number;
}

export interface ConversationState {
  items: ConversationItem[];
  activeIntent: ConversationIntent | null;
  isProcessing: boolean;
  pendingNote: string | null;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `item-${Date.now()}-${idCounter}`;
}

export function createInitialState(): ConversationState {
  return {
    items: [],
    activeIntent: null,
    isProcessing: false,
    pendingNote: null
  };
}

export function addWelcomeMessage(state: ConversationState): ConversationState {
  const welcome: ConversationItem = {
    id: nextId(),
    type: "helper-message",
    content: "Ready to help with technician notes.",
    timestamp: Date.now()
  };
  const status: ConversationItem = {
    id: nextId(),
    type: "action-chips",
    chips: ["Format note", "Test AI", "Status", "Clear"],
    timestamp: Date.now() + 1
  };
  return { ...state, items: [...state.items, welcome, status] };
}

export function addHelperMessage(state: ConversationState, content: string): ConversationState {
  return {
    ...state,
    items: [
      ...state.items,
      { id: nextId(), type: "helper-message", content, timestamp: Date.now() }
    ]
  };
}

export function addUserInput(state: ConversationState, content: string): ConversationState {
  return {
    ...state,
    items: [
      ...state.items,
      { id: nextId(), type: "user-input", content, timestamp: Date.now() }
    ]
  };
}

export function addStatusNotification(state: ConversationState, content: string): ConversationState {
  return {
    ...state,
    items: [
      ...state.items,
      { id: nextId(), type: "status-notification", content, timestamp: Date.now() }
    ]
  };
}

export function addResultCard(
  state: ConversationState,
  result: import("../app/api-client.js").JobResult
): ConversationState {
  const items = [
    ...state.items,
    { id: nextId(), type: "result-card", result, timestamp: Date.now() } as ConversationItem
  ];
  const chips: ConversationItem = {
    id: nextId(),
    type: "action-chips",
    chips: ["Copy formatted note", "Format another", "Clear"],
    timestamp: Date.now() + 1
  };
  return { ...state, items: [...items, chips] };
}

export function addWarningCard(state: ConversationState, title: string, content: string): ConversationState {
  return {
    ...state,
    items: [
      ...state.items,
      { id: nextId(), type: "warning-card", title, content, timestamp: Date.now() }
    ]
  };
}

export function addErrorCard(
  state: ConversationState,
  title: string,
  content: string,
  chips?: string[]
): ConversationState {
  const items: ConversationItem[] = [
    { id: nextId(), type: "error-card", title, content, timestamp: Date.now() }
  ];
  if (chips && chips.length > 0) {
    items.push({ id: nextId(), type: "action-chips", chips, timestamp: Date.now() + 1 });
  }
  return { ...state, items: [...state.items, ...items] };
}

export function addProcessingMessage(state: ConversationState, content: string): ConversationState {
  return {
    ...state,
    isProcessing: true,
    items: [
      ...state.items,
      { id: nextId(), type: "processing", content, timestamp: Date.now() }
    ]
  };
}

export function addChips(state: ConversationState, chips: string[]): ConversationState {
  return {
    ...state,
    items: [
      ...state.items,
      { id: nextId(), type: "action-chips", chips, timestamp: Date.now() }
    ]
  };
}

export function removeProcessing(state: ConversationState): ConversationState {
  return {
    ...state,
    isProcessing: false,
    items: state.items.filter((i) => i.type !== "processing")
  };
}

export function clearConversation(state: ConversationState): ConversationState {
  return createInitialState();
}

export function setPendingNote(state: ConversationState, note: string | null): ConversationState {
  return { ...state, pendingNote: note };
}

export function setActiveIntent(state: ConversationState, intent: ConversationIntent | null): ConversationState {
  return { ...state, activeIntent: intent };
}
