import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { HelperContext } from "../helper-context.js";
import { ProtocolError } from "../contracts/v1/errors.js";

const ToolPolicyUpdateBody = z.object({
  enabled: z.boolean().optional(),
  allowedRoles: z.array(z.enum(["workstation_agent", "ai_host", "combined"])).max(5).optional(),
  requiresConfirmation: z.boolean().optional(),
  executionLocation: z.enum(["local", "repair_stackflow", "hybrid"]).optional()
});

export function registerToolPolicyRoutes(app: FastifyInstance, ctx: HelperContext): void {
  app.get("/api/v1/tools", async (_req, reply) => {
    const tools = ctx.listTools();
    const policies = ctx.getToolPolicies();
    const policyMap = new Map(policies.map((p) => [p.toolId, p]));
    return reply.send({
      tools: tools.map((t) => ({
        ...t,
        policy: policyMap.get(t.toolId) ?? null
      }))
    });
  });

  app.get("/api/v1/tools/:toolId/policy", async (req, reply) => {
    const { toolId } = req.params as { toolId: string };
    const policies = ctx.getToolPolicies().filter((p) => p.toolId === toolId);
    if (policies.length === 0) {
      return reply.status(404).send(new ProtocolError("tool_disabled_by_policy", `No policy for tool '${toolId}'.`, false).toResponse());
    }
    return reply.send(policies[0]);
  });

  app.put("/api/v1/tools/:toolId/policy", async (req, reply) => {
    const { toolId } = req.params as { toolId: string };
    const parsed = ToolPolicyUpdateBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(new ProtocolError("validation_failed", parsed.error.issues.map((i) => i.message).join("; "), false).toResponse());
    }
    try {
      const updated = ctx.updateToolPolicy(toolId, parsed.data);
      await ctx.persistConfiguration();
      return reply.send(updated);
    } catch (e) {
      const err = e instanceof ProtocolError ? e : new ProtocolError("internal_error", "Failed to update tool policy.", false);
      return reply.status(404).send(err.toResponse());
    }
  });

  app.post("/api/v1/tools/:toolId/authorize", async (req, reply) => {
    const { toolId } = req.params as { toolId: string };
    const body = (req.body as { confirmationProvided?: boolean }) ?? {};
    const decision = ctx.authorizeTool({
      toolId,
      confirmationProvided: body.confirmationProvided ?? false
    });
    return reply.send(decision);
  });
}
