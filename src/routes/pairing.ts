import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { HelperContext } from "../helper-context.js";
import { ProtocolError } from "../contracts/v1/errors.js";

const PairBody = z.object({ pairingCode: z.string().min(1).max(128) });

export function registerPairingRoutes(app: FastifyInstance, ctx: HelperContext): void {
  app.post("/api/v1/dev/pair", async (req, reply) => {
    const parsed = PairBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(new ProtocolError("pairing_code_invalid", "Invalid pairing request body.", false).toResponse());
    }
    try {
      const result = await ctx.pair(parsed.data.pairingCode);
      return reply.send({ paired: true, ...result });
    } catch (e) {
      const err = e instanceof ProtocolError ? e : new ProtocolError("internal_error", "Pairing failed.", false);
      const status = err.code === "pairing_code_invalid" ? 400 : err.code === "pairing_code_expired" ? 410 : 500;
      return reply.status(status).send(err.toResponse());
    }
  });

  app.post("/api/v1/dev/unpair", async (_req, reply) => {
    await ctx.unpair();
    return reply.send({ unpaired: true, unpairedAt: new Date().toISOString() });
  });
}
