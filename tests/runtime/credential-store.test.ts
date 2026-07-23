import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryCredentialStore } from "../../src/backend/credential-store.js";
import type { StoredCredential } from "../../src/backend/credential-store.js";

const VALID_CREDENTIAL: StoredCredential = {
  token: "test-token-abc123",
  helperId: "helper-001",
  organizationId: "org-001",
  locationId: "loc-001",
  role: "combined",
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
};

describe("InMemoryCredentialStore", () => {
  let store: InMemoryCredentialStore;

  beforeEach(() => {
    store = new InMemoryCredentialStore();
  });

  it("starts empty", async () => {
    expect(await store.loadCredential()).toBeNull();
    expect(await store.hasCredential()).toBe(false);
  });

  it("saves and loads credential", async () => {
    await store.saveCredential(VALID_CREDENTIAL);
    const loaded = await store.loadCredential();
    expect(loaded?.token).toBe("test-token-abc123");
    expect(loaded?.organizationId).toBe("org-001");
    expect(await store.hasCredential()).toBe(true);
  });

  it("clears credential", async () => {
    await store.saveCredential(VALID_CREDENTIAL);
    await store.clearCredential();
    expect(await store.loadCredential()).toBeNull();
    expect(await store.hasCredential()).toBe(false);
  });

  it("overwriting credential replaces previous", async () => {
    await store.saveCredential(VALID_CREDENTIAL);
    await store.saveCredential({ ...VALID_CREDENTIAL, organizationId: "org-002" });
    const loaded = await store.loadCredential();
    expect(loaded?.organizationId).toBe("org-002");
  });
});
