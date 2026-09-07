import { toJson } from "@/server/errors/index.ts";
import { sessionMiddleware } from "@/server/middlewares/index.ts";
import ActivitiesService from "@/server/services/ActivitiesService.ts";
import { limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

const activities = new Hono()
  .use(sessionMiddleware)
  // List all activities
  .get(
    "/",
    zValidator(
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
      const query = c.req.valid("query");

      const result = await ActivitiesService.initialize().call(
        "findActivities",
        c.var.requestSession,
        {
          search: query.search,
          targetTable: query.targetTable,
          type: query.type,
          orderBy: query.orderBy,
          orderDir: query.orderDir,
        },
        { limit: query.limit, page: query.page },
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  // Resolve activity target to frontend URL
  .get(
    "/resolve/:targetTable/:targetId",
    zValidator(
      "param",
      z.object({
        targetTable: z.string(),
        targetId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { targetTable, targetId } = c.req.valid("param");

      const result = await ActivitiesService.initialize().call(
        "resolveActivityUrl",
        c.var.requestSession,
        targetTable,
        targetId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      const value = result[1];
      if (!value) {
        return c.json({ error: "NotFoundError", cause: "notFound", message: "Entity not found or no link available" }, 404);
      }
      if (typeof value === "object" && "noAccess" in value) {
        return c.json(
          { error: "ForbiddenError", cause: "noAccess", message: `You no longer have access to this ${value.entityType}.` },
          403,
        );
      }

      return c.json({ url: value }, 200);
    },
  );

export default activities;
