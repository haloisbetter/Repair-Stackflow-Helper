import { describe, it, expect } from "vitest";
import { createDevPairingService, listKnownDevCodes } from "../../src/helper/pairing-service.js";
import { ProtocolError } from "../../src/contracts/v1/errors.js";

describe("development pairing service", () => {
  it("pairs with a valid development code", async () => {
    const svc = createDevPairingService();
    const result = await svc.pair("DEV-YORKTOWN");
    expect(result.organizationId).toBe("computer-concepts-dev");
    expect(result.locationId).toBe("yorktown-dev");
    expect(result.helperRole).toBe("combined");
    expect(result.pairedAt).toBeTruthy();
  });

  it("rejects an invalid development pairing code", async () => {
    const svc = createDevPairingService();
    await expect(svc.pair("NOPE")).rejects.toBeInstanceOf(ProtocolError);
    await expect(svc.pair("NOPE")).rejects.toMatchObject({ code: "pairing_code_invalid" });
  });

  it("rejects an expired development code", async () => {
    const svc = createDevPairingService();
    await expect(svc.pair("DEV-EXPIRED")).rejects.toMatchObject({ code: "pairing_code_expired" });
  });

  it("exposes known dev codes", () => {
    expect(listKnownDevCodes()).toContain("DEV-YORKTOWN");
  });
});
