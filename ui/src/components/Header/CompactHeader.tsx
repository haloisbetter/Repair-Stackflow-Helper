import type { HealthSummary, ConfigSummary } from "../../app/api-client.js";
import { StatusIndicator } from "./StatusIndicator.js";
import { MainMenu } from "./MainMenu.js";

interface Props {
  health: HealthSummary | null;
  config: ConfigSummary | null;
  onMenuSelect: (section: string) => void;
}

export function CompactHeader({ health, config, onMenuSelect }: Props) {
  const menuItems = [
    { label: "Status", icon: "●", onClick: () => onMenuSelect("status") },
    { label: "AI Provider", icon: "◉", onClick: () => onMenuSelect("ai-provider") },
    { label: "Settings", icon: "⚙", onClick: () => onMenuSelect("settings") },
    { label: "Developer", icon: "⌘", onClick: () => onMenuSelect("developer") },
    { label: "About", icon: "ⓘ", onClick: () => onMenuSelect("about") }
  ];

  return (
    <header className="compact-header" role="banner">
      <div className="header-left">
        <h1 className="header-title">Repair StackFlow Helper</h1>
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
