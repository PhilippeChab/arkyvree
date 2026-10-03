import "@/server/instrument-web.ts";
import "@/server/log.ts";
import { warmSystemRulesetCache } from "@/server/cache/rulesetCache/index.ts";
import { waitForDatabase } from "@/server/database/waitForDatabase.ts";
import { application } from "@/server/routers/application.ts";
import { onShutdown } from "@/server/shutdown.ts";
import { startBroadcastListener, stopBroadcastListener, websocket } from "@/server/ws.ts";

const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  const required = [
    "APP_URL",
    "RESEND_API_KEY",
    "DATABASE_URL",
    "SIGNING_SECRET",
    "S3_BUCKET",
    "S3_ENDPOINT",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_PUBLIC_URL",
  ] as const;
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[server] Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

await waitForDatabase();
await startBroadcastListener();

// Warm the ruleset cache in the background so the server becomes healthy
// immediately. Cold reads still populate and pin on miss — this just frontloads
// the work for the first user.
warmSystemRulesetCache().then(
  () => console.log("[cache] System ruleset cache warmed"),
  (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cache] System ruleset warm-up failed: ${msg}`);
  },
);

const port = Number(process.env.PORT) || 8000;
const hostname = process.env.HOST || "localhost";

const server = Bun.serve({
  port,
  hostname,
  fetch: application.fetch,
  websocket,
  development: process.env.NODE_ENV !== "production",
});

onShutdown("server", async () => {
  await stopBroadcastListener();
  await server.stop(true);
});

console.log(`[server] Running at http://${hostname}:${port}`);
