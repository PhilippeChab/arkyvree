import { Hono } from "hono";

import { sessionMiddleware } from "@/server/middlewares/index.ts";
import { DashboardService } from "@/server/services/dashboard/index.ts";

export default new Hono().use(sessionMiddleware).get("/stats", async (c) => {
  return c.json(await DashboardService.getStats(c.var.requestSession), 200);
});
