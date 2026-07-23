import type { FastifyInstance } from "fastify";
import type { RuntimeCoordinator } from "../runtime/runtime-coordinator.js";

export function registerRuntimeRoutes(app: FastifyInstance, coordinator: RuntimeCoordinator): void {
  app.get("/api/v1/runtime/status", async (_req, reply) => {
    return reply.send(coordinator.getStatus());
  });

  app.post("/api/v1/runtime/pair", async (req, reply) => {
    const body = req.body as { pairingCode?: string } | null;
    const code = body?.pairingCode;
    if (!code || typeof code !== "string" || code.length < 1) {
      return reply.status(400).send({ error: { code: "validation_failed", message: "pairingCode required.", retriable: false } });
    }
    try {
      await coordinator.pair(code);
      const cred = coordinator.getCredential();
      return reply.send({
        paired: true,
        organizationId: cred?.organizationId ?? null,
        locationId: cred?.locationId ?? null,
        role: cred?.role ?? null
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Pairing failed.";
      return reply.status(400).send({ error: { code: "pairing_code_invalid", message: msg, retriable: false } });
    }
  });

  app.post("/api/v1/runtime/unpair", async (_req, reply) => {
    await coordinator.unpair();
    return reply.send({ unpaired: true });
  });
}
