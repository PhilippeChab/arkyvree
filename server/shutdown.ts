import { stopOtel } from "@/server/otel.ts";

let shuttingDown = false;

/** Whether the process has begun shutting down: a health check answers 503 from then on. */
export function isShuttingDown() {
  return shuttingDown;
}

/**
 * Stops the process cleanly on SIGTERM or SIGINT: `stop` runs once, then OpenTelemetry flushes. A shutdown that
 * takes more than 30s exits anyway.
 */
export function onShutdown(label: string, stop: () => Promise<void>) {
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[${label}] Shutting down...`);
    setTimeout(() => process.exit(0), 30_000);
    await stop();
    await stopOtel();
    console.log(`[${label}] Stopped`);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
