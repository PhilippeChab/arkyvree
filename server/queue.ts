import { readEnv } from "./environment.ts";

/** Wakes the worker (its Flycast URL) to run a job just queued: it may be suspended. */
export function pingWorker() {
  const url = readEnv("WORKER_FLYCAST_URL");
  if (!url) return;
  fetch(url, { signal: AbortSignal.timeout(500) }).catch(() => {});
}
