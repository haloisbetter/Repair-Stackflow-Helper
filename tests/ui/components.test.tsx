import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

// @ts-ignore - jsdom environment
import { CompactHeader } from "../../ui/src/components/Header/CompactHeader.js";
import { StatusIndicator } from "../../ui/src/components/Header/StatusIndicator.js";
import { MainMenu } from "../../ui/src/components/Header/MainMenu.js";
import { Composer } from "../../ui/src/components/Composer/Composer.js";
import { ConversationFeed } from "../../ui/src/components/Conversation/ConversationFeed.js";
import { MessageBubble } from "../../ui/src/components/Conversation/MessageBubble.js";
import { AboutModal } from "../../ui/src/components/Modals/AboutModal.js";
import { ConfirmationModal } from "../../ui/src/components/Modals/ConfirmationModal.js";

afterEach(cleanup);

const mockHealth = {
  state: "ready" as const,
  provider: "ollama" as const,
  ollamaReachable: true,
  modelAvailable: true,
  latencyMs: 82
};

const mockConfig = {
  executionTarget: "local_on_this_machine",
  providerSelection: "ollama",
  ollamaEndpoint: "http://127.0.0.1:11434",
  approvedModel: "llama3.2",
  mockProviderEnabled: true
};

describe("CompactHeader", () => {
  it("displays correct status when ready", () => {
    render(
      <CompactHeader
        health={mockHealth}
        config={mockConfig}
        onMenuSelect={() => {}}
      />
    );
    expect(screen.getByText("Repair StackFlow Helper")).toBeDefined();
    expect(screen.getByText("Ready")).toBeDefined();
    expect(screen.getByText(/Local Ollama · llama3.2/)).toBeDefined();
  });

  it("shows degraded status when Ollama unavailable", () => {
    render(
      <CompactHeader
        health={{ ...mockHealth, state: "degraded", ollamaReachable: false }}
        config={mockConfig}
        onMenuSelect={() => {}}
      />
    );
    expect(screen.getByText("Degraded")).toBeDefined();
    expect(screen.getByText("Ollama unavailable")).toBeDefined();
  });

  it("opens menu and shows sections on click", () => {
    const onMenu = vi.fn();
    render(<CompactHeader health={mockHealth} config={mockConfig} onMenuSelect={onMenu} />);
    const btn = screen.getByLabelText("Open menu");
    fireEvent.click(btn);
    expect(screen.getByText("Status")).toBeDefined();
    expect(screen.getByText("AI Provider")).toBeDefined();
    expect(screen.getByText("Settings")).toBeDefined();
    expect(screen.getByText("Developer")).toBeDefined();
    expect(screen.getByText("About")).toBeDefined();
  });

  it("calls onMenuSelect when a menu item is clicked", () => {
    const onMenu = vi.fn();
    render(<CompactHeader health={mockHealth} config={mockConfig} onMenuSelect={onMenu} />);
    fireEvent.click(screen.getByLabelText("Open menu"));
    fireEvent.click(screen.getByText("Settings"));
    expect(onMenu).toHaveBeenCalledWith("settings");
  });
});

describe("StatusIndicator", () => {
  it("shows mock provider label when mock is selected", () => {
    render(
      <StatusIndicator
        health={mockHealth}
        providerSelection="mock"
        approvedModel="llama3.2"
      />
    );
    expect(screen.getByText("Mock Provider")).toBeDefined();
  });
});

describe("Composer", () => {
  it("disables send while processing", () => {
    render(<Composer onSend={() => {}} disabled={true} />);
    const sendBtn = screen.getByLabelText("Send");
    expect(sendBtn.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Processing…")).toBeDefined();
  });

  it("calls onSend with text when send is clicked", () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);
    const input = screen.getByLabelText("Technician note input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Customer says laptop shuts off" } });
    fireEvent.click(screen.getByLabelText("Send"));
    expect(onSend).toHaveBeenCalledWith("Customer says laptop shuts off");
  });

  it("Enter sends, Shift+Enter does not", () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);
    const input = screen.getByLabelText("Technician note input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "test note" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(onSend).toHaveBeenCalledWith("test note");
  });

  it("does not send empty text", () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);
    fireEvent.click(screen.getByLabelText("Send"));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows attachment icon as disabled", () => {
    render(<Composer onSend={() => {}} disabled={false} />);
    expect(screen.getByLabelText("Attachment (coming later)")).toBeDefined();
  });
});

describe("ConversationFeed", () => {
  it("renders welcome message and action chips", () => {
    const items = [
      { id: "1", type: "helper-message" as const, content: "Ready to help.", timestamp: Date.now() },
      { id: "2", type: "action-chips" as const, chips: ["Format note", "Test AI", "Status", "Clear"], timestamp: Date.now() }
    ];
    render(<ConversationFeed items={items} onChipClick={() => {}} onCopy={() => {}} />);
    expect(screen.getByText("Ready to help.")).toBeDefined();
    expect(screen.getByText("Format note")).toBeDefined();
    expect(screen.getByText("Test AI")).toBeDefined();
  });

  it("renders development mode warning for mock provider", () => {
    const items = [
      { id: "1", type: "warning-card" as const, title: "Development Mode", content: "Mock provider is active.", timestamp: Date.now() }
    ];
    render(<ConversationFeed items={items} onChipClick={() => {}} onCopy={() => {}} />);
    expect(screen.getByText("Development Mode")).toBeDefined();
    expect(screen.getByText("Mock provider is active.")).toBeDefined();
  });

  it("hides empty findings and warnings sections", () => {
    const items = [
      {
        id: "1",
        type: "result-card" as const,
        timestamp: Date.now(),
        result: {
          schemaVersion: "1.0",
          jobId: "j1",
          requestId: "r1",
          helperId: "h1",
          task: "format_technician_note",
          status: "completed",
          idempotencyKey: "k1",
          provider: "mock" as const,
          executionTarget: "local_on_this_machine",
          model: "llama3.2",
          result: {
            formattedNote: "Professional note.",
            customerReportedIssue: "Laptop shuts off.",
            technicianFindings: [],
            recommendedNextStep: "Run diagnostics.",
            warnings: []
          },
          timing: { startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:00:01Z", durationMs: 1 }
        }
      }
    ];
    render(<ConversationFeed items={items} onChipClick={() => {}} onCopy={() => {}} />);
    expect(screen.getByText("Professional note.")).toBeDefined();
    expect(screen.queryByText("Technician Findings")).toBeNull();
    expect(screen.queryByText("Warnings")).toBeNull();
  });

  it("shows DEV MOCK badge for mock provider results", () => {
    const items = [
      {
        id: "1",
        type: "result-card" as const,
        timestamp: Date.now(),
        result: {
          schemaVersion: "1.0",
          jobId: "j1",
          requestId: "r1",
          helperId: "h1",
          task: "format_technician_note",
          status: "completed",
          idempotencyKey: "k1",
          provider: "mock" as const,
          executionTarget: "local_on_this_machine",
          model: "llama3.2",
          result: {
            formattedNote: "Note",
            customerReportedIssue: "Issue",
            technicianFindings: [],
            recommendedNextStep: "Step",
            warnings: []
          },
          timing: { startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:00:01Z", durationMs: 1 }
        }
      }
    ];
    const { container } = render(<ConversationFeed items={items} onChipClick={() => {}} onCopy={() => {}} />);
    expect(screen.getByText("DEV MOCK")).toBeDefined();
  });

  it("shows Ollama unavailable error card with recovery actions", () => {
    const items = [
      { id: "1", type: "error-card" as const, title: "Ollama unavailable", content: "Cannot reach Ollama.", timestamp: Date.now() },
      { id: "2", type: "action-chips" as const, chips: ["Try again", "AI settings", "Use mock"], timestamp: Date.now() }
    ];
    render(<ConversationFeed items={items} onChipClick={() => {}} onCopy={() => {}} />);
    expect(screen.getByText("Ollama unavailable")).toBeDefined();
    expect(screen.getByText("Try again")).toBeDefined();
    expect(screen.getByText("AI settings")).toBeDefined();
    expect(screen.getByText("Use mock")).toBeDefined();
  });

  it("calls onChipClick when a chip is clicked", () => {
    const onChip = vi.fn();
    const items = [
      { id: "1", type: "action-chips" as const, chips: ["Format note"], timestamp: Date.now() }
    ];
    render(<ConversationFeed items={items} onChipClick={onChip} onCopy={() => {}} />);
    fireEvent.click(screen.getByText("Format note"));
    expect(onChip).toHaveBeenCalledWith("Format note");
  });

  it("calls onCopy when copy button is clicked", () => {
    const onCopy = vi.fn();
    const items = [
      {
        id: "1",
        type: "result-card" as const,
        timestamp: Date.now(),
        result: {
          schemaVersion: "1.0",
          jobId: "j1",
          requestId: "r1",
          helperId: "h1",
          task: "format_technician_note",
          status: "completed",
          idempotencyKey: "k1",
          provider: "ollama" as const,
          executionTarget: "local_on_this_machine",
          model: "llama3.2",
          result: {
            formattedNote: "Copy me.",
            customerReportedIssue: "Issue",
            technicianFindings: [],
            recommendedNextStep: "Step",
            warnings: []
          },
          timing: { startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:00:01Z", durationMs: 1 }
        }
      }
    ];
    render(<ConversationFeed items={items} onChipClick={() => {}} onCopy={onCopy} />);
    fireEvent.click(screen.getByLabelText("Copy formatted note"));
    expect(onCopy).toHaveBeenCalledWith("Copy me.", "formatted note");
  });
});

describe("MainMenu keyboard navigation", () => {
  it("closes menu on Escape", () => {
    render(<MainMenu items={[{ label: "Test", onClick: () => {} }]} />);
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(screen.getByText("Test")).toBeDefined();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Test")).toBeNull();
  });
});

describe("AboutModal", () => {
  it("shows development prototype label and limitations", () => {
    render(<AboutModal onClose={() => {}} />);
    expect(screen.getByText(/Development Prototype/)).toBeDefined();
    expect(screen.getByText("Current Limitations")).toBeDefined();
    expect(screen.getByText(/not for production use/)).toBeDefined();
  });
});

describe("ConfirmationModal", () => {
  it("shows confirmation message and buttons", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmationModal
        title="Use Mock Provider"
        message="Use the deterministic mock provider?"
        confirmLabel="Use Mock"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText("Use the deterministic mock provider?")).toBeDefined();
    fireEvent.click(screen.getByText("Use Mock"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmationModal
        title="Test"
        message="msg"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });
});
