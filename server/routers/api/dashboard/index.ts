import { respond } from "@/server/routers/respond.ts";
import { sessionMiddleware } from "@/server/middlewares/index.ts";
import DashboardService from "@/server/services/DashboardService.ts";
import { Hono } from "hono";

export default new Hono().use(sessionMiddleware).get("/stats", async (c) => {
  const result = await DashboardService.initialize().call("getMyStats", c.var.requestSession);
  return respond(c, result, 200);
});
