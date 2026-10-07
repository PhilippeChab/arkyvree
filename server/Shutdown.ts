import Telemetry from "@/server/Telemetry.ts";

/** The process's shutdown: started once, on SIGTERM or SIGINT, and asked about by the health checks. */
class Shutdown {
  private shuttingDown = false;

  /** Whether the process has begun shutting down: a health check answers 503 from then on. */
  isShuttingDown() {
    return this.shuttingDown;
  }

  /**
   * Stops the process cleanly on SIGTERM or SIGINT: `stop` runs once, then OpenTelemetry flushes. A shutdown that
   * takes more than 30s exits anyway.
   */
  onSignal(label: string, stop: () => Promise<void>) {
    const shutdown = async () => {
      if (this.shuttingDown) return;
      this.shuttingDown = true;
      console.log(`[${label}] Shutting down...`);
      setTimeout(() => process.exit(0), 30_000);
      await stop();
      await Telemetry.stop();
      console.log(`[${label}] Stopped`);
      process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }
}

export default new Shutdown();
