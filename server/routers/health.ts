import { type Context, Hono } from "hono";

import { pingDatabase } from "@/server/database/index.ts";

/** The app is up and reaches the database. */
async function answerHealth(c: Context) {
  try {
    await pingDatabase();
    return c.json({ status: "ok" }, 200);
  } catch {
    return c.json({ status: "unhealthy" }, 503);
  }
}

/** The probes: Fly's (`/health`) and ONCE's (`/up`, the self-hosted image's), one answer. */
export default new Hono().get("/health", answerHealth).get("/up", answerHealth);
