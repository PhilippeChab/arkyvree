import { toJson } from "@/server/errors/index.ts";
import { sessionMiddleware } from "@/server/middlewares/index.ts";
import DashboardService from "@/server/services/DashboardService.ts";
import { Hono } from "hono";

export default new Hono().use(sessionMiddleware).get("/stats", async (c) => {
  const result = await DashboardService.initialize().call("getMyStats", c.var.requestSession);
  const success = result[0];

  if (!success) {
    const [error, code] = toJson(result[2]);
    return c.json(error, code);
  }

  return c.json(result[1], 200);
});
