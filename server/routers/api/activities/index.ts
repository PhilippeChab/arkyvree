import { Hono } from "hono";
import { z } from "zod";

import { sessionMiddleware, validate } from "@/server/middlewares/index.ts";
import { limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { ActivitiesService } from "@/server/services/activities/index.ts";

const targetParams = z.object({ targetTable: z.string(), targetId: z.string().uuid() });

export default new Hono()
  .use(sessionMiddleware)
  .get(
    "/",
    validate(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        targetTable: z.string().optional(),
        type: z.string().optional(),
        orderBy: z.enum(["createdAt", "type"]).default("createdAt"),
        orderDir: orderDirDesc,
      }),
    ),
    async (c) => {
      const { search, targetTable, type, orderBy, orderDir, limit, page } = c.req.valid("query");
      return c.json(
        await ActivitiesService.getActivities(
          c.var.requestSession,
          {
            search,
            targetTable,
            type,
            orderBy,
            orderDir,
          },
          { limit, page },
        ),
        200,
      );
    },
  )
  // Resolve activity target to frontend URL
  .get("/resolve/:targetTable/:targetId", validate("param", targetParams), async (c) => {
    const { targetTable, targetId } = c.req.valid("param");

    const value = await ActivitiesService.getActivityUrl(c.var.requestSession, targetTable, targetId);
    if (!value) {
      return c.json(
        { error: "NotFoundError", cause: "notFound", message: "Entity not found or no link available" },
        404,
      );
    }
    if (typeof value === "object" && "noAccess" in value) {
      return c.json(
        {
          error: "ForbiddenError",
          cause: "noAccess",
          message: `You no longer have access to this ${value.entityType}.`,
        },
        403,
      );
    }

    return c.json({ url: value }, 200);
  });
