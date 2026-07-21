import { createHelperContext } from "./helper-context.js";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/environment.js";

const startTime = Date.now();

async function main(): Promise<void> {
  const env = loadEnvironment();
  const ctx = createHelperContext();
  const app = createApp(ctx, startTime);

  try {
    await app.listen({ host: env.host, port: env.port });
    console.log(`Repair StackFlow Helper (development prototype) listening on http://${env.host}:${env.port}`);
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
