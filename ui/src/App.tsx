import { useCallback, useEffect, useRef, useState } from "react";
import { api, type BootstrapResponse, type DeveloperStatus } from "./app/api-client.js";
import {
  type ConversationState,
  createInitialState,
  addWelcomeMessage,
  addWarningCard,
} from "./app/app-state.js";
import {
  mapChipToIntent,
  handleIntent,
  submitTechnicianNote,
} from "./features/technician-note/technician-note-controller.js";
import { CompactHeader } from "./components/Header/CompactHeader.js";
import { ConversationFeed } from "./components/Conversation/ConversationFeed.js";
import { Composer } from "./components/Composer/Composer.js";
import { SettingsModal } from "./components/Modals/SettingsModal.js";
import { DeveloperModal } from "./components/Modals/DeveloperModal.js";
import { ConfirmationModal } from "./components/Modals/ConfirmationModal.js";
import { AboutModal } from "./components/Modals/AboutModal.js";
import { GuidedCheckIn, type CheckInSessionInfo } from "./components/CheckIn/GuidedCheckIn.js";
import "./components/CheckIn/guided-checkin.css";

export type AppMode = "assistant" | "checkin";

type ModalType = "settings" | "developer" | "about" | "confirm-mock" | "confirm-new-checkin" | null;

function deriveChips(enabledTools: string[]): string[] {
  const chips: string[] = [];
  if (enabledTools.includes("format_technician_note")) {
    chips.push("Format note");
  }
  chips.push("Test AI", "Status", "Clear");
  return chips;
}

export default function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [conversation, setConversation] = useState<ConversationState>(createInitialState());
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [devStatus, setDevStatus] = useState<DeveloperStatus | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<AppMode>("assistant");
  const [checkInSession, setCheckInSession] = useState<CheckInSessionInfo | null>(null);
  const [checkInRecording, setCheckInRecording] = useState(false);
  const pendingNewCheckInRef = useRef(false);

  const refreshBootstrap = useCallback(async () => {
    try {
      const b = await api.bootstrap();
      setBootstrap(b);
    } catch {
      // Non-fatal
    }
  }, []);

  const refreshDevStatus = useCallback(async () => {
    try {
      const s = await api.developerStatus();
      setDevStatus(s);
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap]);

  useEffect(() => {
    if (!bootstrap) return;
    let s = createInitialState();
    const welcome = bootstrap.assistant?.welcomeMessage ?? "Ready to help with today's repairs.";
    const chips = deriveChips(bootstrap.enabledTools ?? ["format_technician_note"]);
    s = addWelcomeMessage(s, welcome, chips);
    if (bootstrap.config.providerSelection === "mock") {
      s = addWarningCard(
        s,
        "Development Mode",
        "The deterministic mock provider is active. Results are for testing only."
      );
    }
    setConversation(s);
  }, [bootstrap?.identity.pairingState, bootstrap?.config.providerSelection, bootstrap?.assistant?.profileVersion, bootstrap?.enabledTools]);

  const handleCopy = useCallback((text: string, label: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopyMsg(`Copied ${label}. Paste this into the Repair StackFlow technician note field.`);
      setTimeout(() => setCopyMsg(null), 4000);
    });
  }, []);

  const handleChipClick = useCallback(
    async (chip: string) => {
      if (chip === "Copy formatted note" || chip === "Copy all") {
        return;
      }
      if (chip === "AI settings") {
        setActiveModal("settings");
        return;
      }
      if (chip === "Use mock") {
        setActiveModal("confirm-mock");
        return;
      }
      if (chip === "Open settings") {
        setActiveModal("settings");
        return;
      }
      if (chip === "Start Guided Check-In") {
        if (checkInSession) {
          setMode("checkin");
        } else {
          setMode("checkin");
        }
        return;
      }
      const intent = mapChipToIntent(chip);
      if (!intent) return;
      const result = await handleIntent(intent, conversation, bootstrap);
      setConversation(result.state);
      if (intent === "test_ai_connection") void refreshBootstrap();
    },
    [conversation, bootstrap, refreshBootstrap, checkInSession]
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (conversation.isProcessing) return;
      const result = await submitTechnicianNote(conversation, text, bootstrap);
      setConversation(result.state);
      void refreshBootstrap();
    },
    [conversation, bootstrap, refreshBootstrap]
  );

  const handleMenuSelect = useCallback(
    (section: string) => {
      switch (section) {
        case "settings":
          setActiveModal("settings");
          break;
        case "developer":
          void refreshDevStatus();
          setActiveModal("developer");
          break;
        case "about":
          setActiveModal("about");
          break;
        case "status":
          void (async () => {
            await refreshBootstrap();
            const result = await handleIntent("view_status", conversation, bootstrap);
            setConversation(result.state);
          })();
          break;
        case "ai-provider":
          void (async () => {
            await refreshBootstrap();
            const result = await handleIntent("test_ai_connection", conversation, bootstrap);
            setConversation(result.state);
          })();
          break;
      }
    },
    [conversation, bootstrap, refreshBootstrap, refreshDevStatus]
  );

  const handleConfirmMock = useCallback(async () => {
    try {
      await api.selectProvider("mock");
      await refreshBootstrap();
    } catch {
      // Non-fatal
    }
    setActiveModal(null);
  }, [refreshBootstrap]);

  const handleModalClose = useCallback(() => {
    setActiveModal(null);
  }, []);

  const switchMode = useCallback((newMode: AppMode) => {
    setMode(newMode);
  }, []);

  const handleCheckInSessionChange = useCallback((info: CheckInSessionInfo | null) => {
    setCheckInSession(info);
  }, []);

  const handleCheckInRecordingChange = useCallback((recording: boolean) => {
    setCheckInRecording(recording);
  }, []);

  const handleStartNewCheckIn = useCallback(() => {
    if (checkInSession && !isTerminalState(checkInSession.state)) {
      setActiveModal("confirm-new-checkin");
      pendingNewCheckInRef.current = true;
    } else {
      setMode("checkin");
    }
  }, [checkInSession]);

  const confirmNewCheckIn = useCallback(() => {
    setActiveModal(null);
    pendingNewCheckInRef.current = false;
    setMode("checkin");
  }, []);

  const assistantChips = checkInSession
    ? [...deriveChips(bootstrap?.enabledTools ?? ["format_technician_note"]), "Start Guided Check-In"]
    : [...deriveChips(bootstrap?.enabledTools ?? ["format_technician_note"]), "Start Guided Check-In"];

  return (
    <div className="companion-window" role="application" aria-label={bootstrap?.assistant?.name ?? "Repair StackFlow Helper"}>
      <CompactHeader
        health={bootstrap?.health ?? null}
        config={bootstrap?.config ?? null}
        assistant={bootstrap?.assistant ?? null}
        onMenuSelect={handleMenuSelect}
      />
      <div className="mode-switch" role="tablist" aria-label="Application mode">
        <button
          className={`mode-tab ${mode === "assistant" ? "active" : ""}`}
          role="tab"
          aria-selected={mode === "assistant"}
          onClick={() => switchMode("assistant")}
        >
          Assistant
        </button>
        <button
          className={`mode-tab ${mode === "checkin" ? "active" : ""}`}
          role="tab"
          aria-selected={mode === "checkin"}
          onClick={() => switchMode("checkin")}
        >
          Guided Check-In
        </button>
      </div>

      {mode === "assistant" && (
        <>
          {checkInSession && !isTerminalState(checkInSession.state) && (
            <div className="checkin-active-banner" role="status">
              <div className="banner-info">
                <span className="banner-pulse" />
                <span className="banner-text">
                  Guided Check-In in progress
                  {checkInSession.customerName && ` — ${checkInSession.customerName}`}
                  {" — "}
                  <span className="banner-state">{checkInSession.state}</span>
                  {checkInRecording && <span className="banner-recording"> • Recording</span>}
                </span>
              </div>
              <button
                className="banner-return-btn"
                onClick={() => switchMode("checkin")}
              >
                Return to Check-In
              </button>
            </div>
          )}
          <main className="companion-main">
            <ConversationFeed
              items={conversation.items}
              onChipClick={handleChipClick}
              onCopy={handleCopy}
            />
          </main>
          <Composer
            onSend={handleSend}
            disabled={conversation.isProcessing}
            placeholder="Type a technician note or choose an action…"
          />
        </>
      )}

      {mode === "checkin" && (
        <GuidedCheckIn
          onClose={() => switchMode("assistant")}
          onSessionChange={handleCheckInSessionChange}
          onRecordingChange={handleCheckInRecordingChange}
        />
      )}

      {copyMsg && (
        <div className="copy-toast" role="status" aria-live="polite">{copyMsg}</div>
      )}
      {activeModal === "settings" && (
        <SettingsModal
          bootstrap={bootstrap}
          onClose={handleModalClose}
          onRefresh={refreshBootstrap}
        />
      )}
      {activeModal === "developer" && (
        <DeveloperModal
          status={devStatus}
          bootstrap={bootstrap}
          onClose={handleModalClose}
          onRefresh={refreshDevStatus}
        />
      )}
      {activeModal === "about" && <AboutModal onClose={handleModalClose} />}
      {activeModal === "confirm-mock" && (
        <ConfirmationModal
          title="Use Mock Provider"
          message="Use the deterministic mock provider for testing? Results are for testing only."
          confirmLabel="Use Mock"
          onConfirm={handleConfirmMock}
          onCancel={handleModalClose}
        />
      )}
      {activeModal === "confirm-new-checkin" && (
        <ConfirmationModal
          title="Start New Check-In?"
          message="A check-in session is already in progress. Starting a new one will cancel the current session. Continue?"
          confirmLabel="Start New"
          onConfirm={confirmNewCheckIn}
          onCancel={handleModalClose}
        />
      )}
    </div>
  );
}

function isTerminalState(state: string): boolean {
  return state === "accepted" || state === "rejected" || state === "cancelled" || state === "expired" || state === "error";
}
