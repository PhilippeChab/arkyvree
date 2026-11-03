import { Hono } from "hono";
import { z } from "zod";

import { sessionMiddleware, validate } from "@/server/middlewares/index.ts";
import { limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { ActivitiesService } from "@/server/services/activities/index.ts";

const targetParams = z.object({ targetType: z.string(), targetId: z.string().uuid() });

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
        type: z.string().optional(),
        orderBy: z.enum(["createdAt", "type"]).default("createdAt"),
        orderDir: orderDirDesc,
      }),
    ),
    async (c) => {
      const { search, type, orderBy, orderDir, limit, page } = c.req.valid("query");
      return c.json(
        await ActivitiesService.getActivities(
          c.var.requestSession,
          {
            asTitled: true,
            search,
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
  // Resolve activity target to frontend URL: a ruleset's content in the ruleset the activity recorded writing, when it
  // names one (its data's `rulesetId`) and that ruleset shows it
  .get(
    "/resolve/:targetType/:targetId",
    validate("param", targetParams),
    validate("query", z.object({ rulesetId: z.string().uuid().optional() })),
    async (c) => {
      const { targetType, targetId } = c.req.valid("param");
      const { rulesetId } = c.req.valid("query");

      const value = await ActivitiesService.getActivityUrl(c.var.requestSession, targetType, targetId, rulesetId);
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
            message: `You no longer have access to this ${value.entityType}`,
          },
          403,
        );
      }

      return c.json({ url: value }, 200);
    },
  );
