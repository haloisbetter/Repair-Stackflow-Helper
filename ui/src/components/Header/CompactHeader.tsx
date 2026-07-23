import type { HealthSummary, ConfigSummary, AssistantProfile } from "../../app/api-client.js";
import { StatusIndicator } from "./StatusIndicator.js";
import { MainMenu } from "./MainMenu.js";

interface Props {
  health: HealthSummary | null;
  config: ConfigSummary | null;
  assistant?: AssistantProfile | null;
  onMenuSelect: (section: string) => void;
}

export function CompactHeader({ health, config, assistant, onMenuSelect }: Props) {
  const menuItems = [
    { label: "Status", icon: "●", onClick: () => onMenuSelect("status") },
    { label: "AI Provider", icon: "◉", onClick: () => onMenuSelect("ai-provider") },
    { label: "Settings", icon: "⚙", onClick: () => onMenuSelect("settings") },
    { label: "Guided Check-In", icon: "✓", onClick: () => onMenuSelect("checkin") },
    { label: "Developer", icon: "⌘", onClick: () => onMenuSelect("developer") },
    { label: "About", icon: "ⓘ", onClick: () => onMenuSelect("about") }
  ];

  const name = assistant?.name ?? "Repair StackFlow Helper";
  const subtitle = assistant?.subtitle ?? undefined;
  const accentColor = assistant?.appearance?.accentColor ?? undefined;
  const initials = assistant?.avatar?.value ?? undefined;

  const style = accentColor ? ({ ["--accent-color" as string]: accentColor } as React.CSSProperties) : undefined;

  return (
    <header className="compact-header" role="banner" style={style}>
      <div className="header-left">
        <div className="header-brand">
          {initials && <span className="header-avatar" aria-hidden="true">{initials}</span>}
          <div className="header-titles">
            <h1 className="header-title">{name}</h1>
            {subtitle && <span className="header-subtitle">{subtitle}</span>}
          </div>
        </div>
        {config && (
          <StatusIndicator
            health={health}
            providerSelection={config.providerSelection}
            approvedModel={config.approvedModel}
          />
        )}
      </div>
      <MainMenu items={menuItems} />
    </header>
  );
}
