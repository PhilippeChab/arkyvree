import { websocket } from "hono/bun";

import "@/server/instrument-web.ts";
import "@/server/log.ts";
import { RulesetCache } from "@/server/cache/rulesetCache/index.ts";
import { waitForDatabase } from "@/server/database/index.ts";
import { isProduction, readEnv, REQUIRED_IN_PRODUCTION } from "@/server/environment.ts";
import { application } from "@/server/routers/application.ts";
import Shutdown from "@/server/Shutdown.ts";
import { BroadcastListener } from "@/server/websockets/index.ts";

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
function warmRulesetCache() {
  RulesetCache.warm().then(
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
  warmRulesetCache();

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
