import { websocket } from "hono/bun";

import "./instrument-web.ts";
import "./log.ts";
import { RulesetViews } from "./cow/index.ts";
import { waitForDatabase } from "./database/index.ts";
import { checkEmailSetup, findPendingEmailSetup } from "./emails/index.ts";
import { isProduction, readEnv, REQUIRED_IN_PRODUCTION } from "./environment.ts";
import { startEmailSetupPage, startUpdatingPage } from "./noticePages.ts";
import { application } from "./routers/application.ts";
import Shutdown from "./Shutdown.ts";
import { checkStorageConfiguration } from "./storage/ObjectStorage.ts";
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
  const port = Number(readEnv("PORT")) || 8000;
  const hostname = readEnv("HOST") || "localhost";
  // A self-hosted install's new version, while the one it replaces still runs on its volume (docker/entrypoint.sh)
  if (readEnv("UPDATING_PAGE") === "true") return startUpdatingPage({ hostname, port });

  checkProductionEnvironment();
  checkStorageConfiguration("server");
  // A self-hosted install whose email isn't set up yet says so on its page, rather than stopping
  const pendingEmailSetup = findPendingEmailSetup();
  if (pendingEmailSetup) return startEmailSetupPage(pendingEmailSetup, { hostname, port });

  checkEmailSetup("server");
  await waitForDatabase();
  await BroadcastListener.start();
  warmRulesetViews();

  const server = Bun.serve({
    port,
    hostname,
    fetch: application.fetch,
    websocket,
    development: !isProduction(),
    // The self-hosted image's updating page answers on the port until this server listens beside it
    reusePort: readEnv("REUSE_PORT") === "true",
  });

  Shutdown.onSignal("server", async () => {
    await BroadcastListener.stop();
    await server.stop(true);
  });

  console.log(`[server] Running at http://${hostname}:${port}`);
}

await main();
