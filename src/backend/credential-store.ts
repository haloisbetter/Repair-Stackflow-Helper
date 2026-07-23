/**
 * Credential store abstraction.
 * 
 * The TypeScript prototype uses file-based storage outside the config directory.
 * This does NOT provide Keychain-level security. The future native macOS 
 * implementation MUST use macOS Keychain via SecItemAdd/SecItemCopyMatching.
 */
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveConfigurationPaths } from "../config/configuration-paths.js";

export interface StoredCredential {
  token: string;
  helperId: string;
  organizationId: string;
  locationId: string;
  role: string;
  issuedAt: string;
  expiresAt: string;
}

export interface CredentialStore {
  loadCredential(): Promise<StoredCredential | null>;
  saveCredential(credential: StoredCredential): Promise<void>;
  clearCredential(): Promise<void>;
  hasCredential(): Promise<boolean>;
}

export class FileCredentialStore implements CredentialStore {
  private readonly filePath: string;

  constructor(directory?: string) {
    const paths = resolveConfigurationPaths(directory);
    this.filePath = join(paths.directory, ".credential");
  }

  async loadCredential(): Promise<StoredCredential | null> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.token || !parsed.helperId) return null;
      return parsed as StoredCredential;
    } catch {
      return null;
    }
  }

  async saveCredential(credential: StoredCredential): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(credential), { encoding: "utf-8", mode: 0o600 });
  }

  async clearCredential(): Promise<void> {
    await unlink(this.filePath).catch(() => {});
  }

  async hasCredential(): Promise<boolean> {
    const cred = await this.loadCredential();
    return cred !== null;
  }
}

export class InMemoryCredentialStore implements CredentialStore {
  private credential: StoredCredential | null = null;

  async loadCredential(): Promise<StoredCredential | null> {
    return this.credential;
  }

  async saveCredential(credential: StoredCredential): Promise<void> {
    this.credential = credential;
  }

  async clearCredential(): Promise<void> {
    this.credential = null;
  }

  async hasCredential(): Promise<boolean> {
    return this.credential !== null;
  }
}
