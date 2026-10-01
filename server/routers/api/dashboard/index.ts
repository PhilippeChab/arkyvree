import { Hono } from "hono";

import { sessionMiddleware } from "@/server/middlewares/index.ts";
import { respond } from "@/server/routers/respond.ts";
import DashboardService from "@/server/services/DashboardService.ts";

export default new Hono().use(sessionMiddleware).get("/stats", async (c) => {
  const result = await DashboardService.initialize().call("getMyStats", c.var.requestSession);
  return respond(c, result, 200);
});
