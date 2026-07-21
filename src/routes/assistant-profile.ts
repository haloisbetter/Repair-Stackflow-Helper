import type { FastifyInstance } from "fastify";
import type { HelperContext } from "../helper-context.js";
import { ProtocolError } from "../contracts/v1/errors.js";
import { AssistantProfileSchema } from "../assistant/assistant-profile.js";
import { InstructionProfileSchema } from "../assistant/instruction-profile.js";

export function registerAssistantProfileRoutes(app: FastifyInstance, ctx: HelperContext): void {
  app.get("/api/v1/assistant/profile", async (_req, reply) => {
    return reply.send(ctx.getAssistantProfile());
  });

  app.put("/api/v1/assistant/profile", async (req, reply) => {
    const parsed = AssistantProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(new ProtocolError("validation_failed", parsed.error.issues.map((i: { message: string }) => i.message).join("; "), false).toResponse());
    }
    const updated = ctx.updateAssistantProfile(parsed.data);
    return reply.send(updated);
  });

  app.get("/api/v1/assistant/instructions", async (_req, reply) => {
    return reply.send(ctx.getInstructionProfile());
  });

  app.put("/api/v1/assistant/instructions", async (req, reply) => {
    const parsed = InstructionProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(new ProtocolError("validation_failed", parsed.error.issues.map((i: { message: string }) => i.message).join("; "), false).toResponse());
    }
    const updated = ctx.updateInstructionProfile(parsed.data);
    return reply.send(updated);
  });

  app.post("/api/v1/assistant/reset", async (_req, reply) => {
    ctx.resetAssistantProfile();
    return reply.send({ reset: true });
  });

  app.get("/api/v1/assistant/runtime", async (_req, reply) => {
    return reply.send(ctx.getRuntimeConfig());
  });
}
