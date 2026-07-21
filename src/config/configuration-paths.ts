import { homedir, platform } from "node:os";
import { join } from "node:path";

const APP_DIR_NAME = "RepairStackFlowHelper";
const LINUX_DIR_NAME = "repair-stackflow-helper";

export function getDefaultConfigurationDirectory(): string {
  const home = homedir();
  const p = platform();

  if (p === "darwin") {
    return join(home, "Library", "Application Support", APP_DIR_NAME);
  }

  if (p === "win32") {
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    return join(appData, APP_DIR_NAME);
  }

  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig && xdgConfig.length > 0) {
    return join(xdgConfig, LINUX_DIR_NAME);
  }
  return join(home, ".config", LINUX_DIR_NAME);
}

export interface ConfigurationPaths {
  readonly directory: string;
  readonly activeFile: string;
  readonly backupFile: string;
  readonly tempFile: string;
}

export function resolveConfigurationPaths(directory?: string): ConfigurationPaths {
  const dir = directory ?? getDefaultConfigurationDirectory();
  return {
    directory: dir,
    activeFile: join(dir, "configuration.json"),
    backupFile: join(dir, "configuration.backup.json"),
    tempFile: join(dir, "configuration.tmp.json")
  };
}
