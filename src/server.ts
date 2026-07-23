import { createHelperContext } from "./helper-context.js";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/environment.js";
import { RuntimeCoordinator, DEFAULT_RUNTIME_CONFIG } from "./runtime/runtime-coordinator.js";
import { DevelopmentBackendClient } from "./backend/development-backend-client.js";
import { InMemoryCredentialStore } from "./backend/credential-store.js";
import { InMemoryPendingSubmissionStore } from "./runtime/pending-submission-store.js";

const startTime = Date.now();

async function main(): Promise<void> {
  const env = loadEnvironment();
  const ctx = createHelperContext();

  try {
    const status = await ctx.loadConfiguration();
    if (status.warning) {
      console.warn(`Configuration warning: ${status.warning}`);
    }
    console.log(`Configuration loaded from: ${status.source}`);
  } catch (e) {
    console.warn(`Configuration load failed, using defaults: ${e instanceof Error ? e.message : String(e)}`);
  }

  const backendClient = new DevelopmentBackendClient();
  const credentialStore = new InMemoryCredentialStore();
  const pendingStore = new InMemoryPendingSubmissionStore();

  const coordinator = new RuntimeCoordinator(
    {
      backendClient,
      credentialStore,
      pendingStore,
      taskRegistry: ctx.taskRegistry,
      jobRunner: ctx.jobRunner,
      getIdentity: () => {
        const id = ctx.getIdentity();
        return {
          helperId: id.helperId,
          organizationId: id.organizationId ?? "",
          locationId: id.locationId ?? "",
          role: id.role,
          appVersion: id.appVersion,
          platform: id.platform,
          architecture: id.architecture
        };
      },
      getHealth: () => ctx.getHealth(),
      getAssistantProfileVersion: () => ctx.getAssistantProfile().profileVersion,
      getInstructionProfileVersion: () => ctx.getInstructionProfile().profileVersion,
      getToolPolicyVersion: () => 1,
      onStateChange: (from, to) => {
        console.log(`Helper state: ${from} → ${to}`);
      }
    },
    { ...DEFAULT_RUNTIME_CONFIG, mode: "development" }
  );

  await coordinator.start();

  const app = createApp(ctx, startTime, coordinator);

  try {
    await app.listen({ host: env.host, port: env.port });
    console.log(`Repair StackFlow Helper (development prototype) listening on http://${env.host}:${env.port}`);
    console.log(`Runtime mode: ${coordinator.getStatus().mode} | State: ${coordinator.helperState.state}`);
    console.log("This is a development prototype. Not for production use.");
  } catch (e) {
    app.log.error(e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
