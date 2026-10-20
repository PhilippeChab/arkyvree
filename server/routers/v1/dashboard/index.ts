import { Hono } from "hono";

import { type ApiKeyContext, describeRoute } from "@/server/middlewares/index.ts";
import { v1Stats } from "@/server/routers/v1/schemas/dashboard.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { DashboardService } from "@/server/services/dashboard/index.ts";

/** The key's user's dashboard: how many of each record they have. */
export default new Hono<ApiKeyContext>().get(
  "/stats",
  describeRoute({
    response: v1Stats,
    status: 200,
    summary: "How many campaigns, characters and rulesets the key's user has",
  }),
  async (c) => c.json(V1.stats(await DashboardService.getStats(c.var.requestSession)), 200),
);
