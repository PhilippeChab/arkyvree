import { Hono } from "hono";
import { z } from "zod";

import { ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { orderDirDesc } from "@/server/routers/api/validation.ts";
import { toEntityType } from "@/server/routers/v1/kinds.ts";
import { v1ActivityPage, v1TargetPage } from "@/server/routers/v1/schemas/activities.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { ActivitiesService } from "@/server/services/activities/index.ts";

/** A record an activity or a notification is about, by its kind as v1 names it. */
const targetParams = z.object({
  kind: z
    .string()
    .transform(toEntityType)
    .meta({ description: "The record's kind, as an activity's or a notification's `target` names it" }),
  targetId: z.string().uuid(),
});

/** What the key's user did, from the last three months, and the app's page of what each is about. */
export default new Hono<ApiKeyContext>()
  .get(
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
        kind: z
          .string()
          .optional()
          .transform((kind) => kind && toEntityType(kind))
          .meta({ description: "Only those about a kind of record (`characters`, `campaigns`, `classes`…)" }),
        orderBy: z.enum(["createdAt", "type"]).default("createdAt"),
        orderDir: orderDirDesc,
        search: z.string().optional().meta({ description: "A part of the type" }),
        type: z.string().optional().meta({ description: "Only those of a type: `createCampaign`, `generatePdf`…" }),
      }),
    ),
    async (c) => {
      const { kind, limit, orderBy, orderDir, page, search, type } = c.req.valid("query");
      const activities = await ActivitiesService.getActivities(
        c.var.requestSession,
        { orderBy, orderDir, search, targetTable: kind, type },
        { limit, page },
      );
      return c.json(V1.page(activities, V1.activity), 200);
    },
  )
  .get(
    "/targets/:kind/:targetId",
    describeRoute({
      response: v1TargetPage,
      status: 200,
      summary:
        "The app's page that shows what an activity or a notification is about: a 404 once it's gone, a 403 once " +
        "the key's user lost access to it. An export has no page: `GET /v1/exports/{id}` reads it",
    }),
    validate("param", targetParams),
    async (c) => {
      const { kind, targetId } = c.req.valid("param");
      const page = await ActivitiesService.getActivityUrl(c.var.requestSession, kind, targetId);
      if (!page) throw new NotFoundError("Entity not found or no link available");
      if (typeof page === "object") throw new ForbiddenError(`You no longer have access to this ${page.entityType}`);
      return c.json(V1.targetPage(page), 200);
    },
  );
