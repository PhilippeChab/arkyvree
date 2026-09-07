import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { FeatsService } from "@/server/services/rulesets/index.ts";
import { entityOrderBy, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:id/feats/grouped",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        aptitudeId: z.string().uuid().optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, childOnly, aptitudeId } = c.req.valid("query");

      const featsService = FeatsService.initialize();
      const result = await featsService.call("getRulesetFeatsGrouped", id, { search, childOnly, aptitudeId }, { limit, page });
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/feats",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        aptitudeId: z.string().uuid().optional(),
        family: z.string().optional(),
        orderBy: entityOrderBy,
        orderDir: orderDirAsc,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, childOnly, aptitudeId, family, orderBy, orderDir } = c.req.valid("query");

      const featsService = FeatsService.initialize();
      const result = await featsService.call("getRulesetFeats", id, { search, childOnly, aptitudeId, family, orderBy, orderDir }, { limit, page });
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/feats/:featId",
    zValidator("param", z.object({ id: z.string().uuid(), featId: z.string().uuid() })),
    async (c) => {
      const { id, featId } = c.req.valid("param");

      const featsService = FeatsService.initialize();
      const result = await featsService.call("getRulesetFeat", id, featId);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/feats",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
        aptitudeIds: z.array(z.string().uuid()).min(1, "At least one aptitude must be selected"),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const featsService = FeatsService.initialize();
      const result = await featsService.call("createRulesetFeat", c.var.requestSession, id, body);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .put(
    "/:id/feats/:featId",
    zValidator("param", z.object({ id: z.string().uuid(), featId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
        aptitudeIds: z.array(z.string().uuid()).optional(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, featId } = c.req.valid("param");
      const body = c.req.valid("json");

      const featsService = FeatsService.initialize();
      const result = await featsService.call(
        "updateRulesetFeat",
        c.var.requestSession,
        id,
        featId,
        body,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .delete(
    "/:id/feats/:featId",
    zValidator("param", z.object({ id: z.string().uuid(), featId: z.string().uuid() })),
    async (c) => {
      const { id, featId } = c.req.valid("param");

      const featsService = FeatsService.initialize();
      const result = await featsService.call("deleteRulesetFeat", c.var.requestSession, id, featId);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
