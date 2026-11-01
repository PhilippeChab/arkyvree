import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { orderDirDesc } from "@/server/routers/api/validation.ts";
import { v1ActivityPage } from "@/server/routers/v1/schemas/activities.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { ActivitiesService } from "@/server/services/activities/index.ts";

/** What the key's user did, from the last three months. */
export default new Hono<ApiKeyContext>().get(
  "/",
  describeRoute({
    response: v1ActivityPage,
    status: 200,
    summary: "What the key's user did in the last three months, a page at a time",
  }),
  validate(
    "query",
    z.object({
      ...PAGE_FILTERS,
      orderBy: z.enum(["createdAt", "type"]).default("createdAt"),
      orderDir: orderDirDesc,
      search: z.string().optional().meta({ description: "A part of the type" }),
      type: z.string().optional().meta({ description: "Only those of a type: `createCampaign`, `generatePdf`…" }),
    }),
  ),
  async (c) => {
    const { limit, orderBy, orderDir, page, search, type } = c.req.valid("query");
    const activities = await ActivitiesService.getActivities(
      c.var.requestSession,
      { orderBy, orderDir, search, type },
      { limit, page },
    );
    return c.json(V1.page(activities, V1.activity), 200);
  },
);
