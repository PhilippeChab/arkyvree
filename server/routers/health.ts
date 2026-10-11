import { Hono } from "hono";

import { pingDatabase } from "@/server/database/index.ts";

/** Fly's probe: the app is up and reaches the database. */
export default new Hono().get("/health", async (c) => {
  try {
    await pingDatabase();
    return c.json({ status: "ok" }, 200);
  } catch {
    return c.json({ status: "unhealthy" }, 503);
  }
});
