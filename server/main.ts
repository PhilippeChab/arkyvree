import "@/server/instrument-web.ts";
import "@/server/log.ts";

import { sql } from "drizzle-orm";

import { warmSystemRulesetCache } from "@/server/cache/rulesetCache.ts";
import { db } from "@/server/database/index.ts";
import { shutdownOtel } from "@/server/otel.ts";
import { application } from "@/server/routers/application.ts";
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

const warmUp = async (attempts = 4, delayMs = 500) => {
  for (let i = 1; i <= attempts; i++) {
    try {
      await db.execute(sql`SELECT 1`);
      console.log("[db] Connection pool warmed up");
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[db] Warm-up attempt ${i}/${attempts} failed: ${msg}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, delayMs * i));
    }
  }
  console.error("[db] Unreachable after all retries — exiting");
  process.exit(1);
};

await warmUp();
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

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[server] Shutting down...");
  setTimeout(() => process.exit(0), 30_000);
  await stopBroadcastListener();
  await server.stop(true);
  await shutdownOtel();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log(`[server] Running at http://${hostname}:${port}`);
