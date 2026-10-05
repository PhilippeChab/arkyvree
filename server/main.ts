import { RulesetCache } from "@/server/cache/rulesetCache/index.ts";
import "@/server/instrument-web.ts";
import "@/server/log.ts";
import { waitForDatabase } from "@/server/database/index.ts";
import { isProduction, readEnv, REQUIRED_IN_PRODUCTION } from "@/server/environment.ts";
import { application } from "@/server/routers/application.ts";
import { onShutdown } from "@/server/shutdown.ts";
import { BroadcastListener, websocket } from "@/server/websockets/index.ts";

if (isProduction()) {
  const missing = REQUIRED_IN_PRODUCTION.filter((name) => !readEnv(name));
  if (missing.length > 0) {
    console.error(`[server] Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

await waitForDatabase();
await BroadcastListener.start();

// Warm the ruleset cache in the background so the server becomes healthy
// immediately. Cold reads still populate and pin on miss — this just frontloads
// the work for the first user.
RulesetCache.warm().then(
  () => console.log("[cache] System ruleset cache warmed"),
  (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cache] System ruleset warm-up failed: ${msg}`);
  },
);

const port = Number(readEnv("PORT")) || 8000;
const hostname = readEnv("HOST") || "localhost";

const server = Bun.serve({
  port,
  hostname,
  fetch: application.fetch,
  websocket,
  development: !isProduction(),
});

onShutdown("server", async () => {
  await BroadcastListener.stop();
  await server.stop(true);
});

console.log(`[server] Running at http://${hostname}:${port}`);
