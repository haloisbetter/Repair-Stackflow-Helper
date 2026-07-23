import Fastify, { type FastifyInstance } from "fastify";
import type { HelperContext } from "./helper-context.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerDiagnosticsRoutes } from "./routes/diagnostics.js";
import { registerConversationRoutes } from "./routes/conversation.js";
import { registerAssistantProfileRoutes } from "./routes/assistant-profile.js";
import { registerToolPolicyRoutes } from "./routes/tool-policies.js";
import { registerConfigurationRoutes } from "./routes/configuration.js";
import { registerRuntimeRoutes } from "./routes/runtime.js";
import { registerReviewRoutes } from "./routes/review.js";
import type { RuntimeCoordinator } from "./runtime/runtime-coordinator.js";

export function createApp(ctx: HelperContext, startTime: number = Date.now(), coordinator?: RuntimeCoordinator): FastifyInstance {
  const app = Fastify({ logger: false });
  registerHealthRoutes(app, ctx);
  registerJobRoutes(app, ctx);
  registerDiagnosticsRoutes(app, ctx);
  registerConversationRoutes(app, ctx, startTime);
  registerAssistantProfileRoutes(app, ctx);
  registerToolPolicyRoutes(app, ctx);
  registerConfigurationRoutes(app, ctx);
  if (coordinator) {
    registerRuntimeRoutes(app, coordinator);
  }
  registerReviewRoutes(app, ctx.proposalStore);
  return app;
}
