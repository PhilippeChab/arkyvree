import { websocket } from "hono/bun";

import "./instrument-web.ts";
import "./log.ts";
import { RulesetViews } from "./cow/index.ts";
import { waitForDatabase } from "./database/index.ts";
import { isProduction, readEnv, REQUIRED_IN_PRODUCTION } from "./environment.ts";
import { application } from "./routers/application.ts";
import Shutdown from "./Shutdown.ts";
import { BroadcastListener } from "./websockets/index.ts";

/** Stops a production start that lacks a variable production needs. */
function checkProductionEnvironment() {
  if (!isProduction()) return;
  const missing = REQUIRED_IN_PRODUCTION.filter((name) => !readEnv(name));
  if (missing.length > 0) {
    console.error(`[server] Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

/**
 * Warms the ruleset cache in the background so the server becomes healthy immediately. Cold reads still populate and
 * pin on miss — this just frontloads the work for the first user.
 */
function warmRulesetViews() {
  RulesetViews.warm().then(
    () => console.log("[cache] System ruleset cache warmed"),
    (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cache] System ruleset warm-up failed: ${msg}`);
    },
  );
}

async function main() {
  checkProductionEnvironment();
  await waitForDatabase();
  await BroadcastListener.start();
  warmRulesetViews();

  const port = Number(readEnv("PORT")) || 8000;
  const hostname = readEnv("HOST") || "localhost";
  const server = Bun.serve({
    port,
    hostname,
    fetch: application.fetch,
    websocket,
    development: !isProduction(),
  });

  Shutdown.onSignal("server", async () => {
    await BroadcastListener.stop();
    await server.stop(true);
  });

  console.log(`[server] Running at http://${hostname}:${port}`);
}

await main();
