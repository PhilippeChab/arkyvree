import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";

export default new Hono<SessionContext>()
  .get(
    "/:id/feats/grouped",
    zValidator("param", idParam),
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
      return c.json(
        await FeatsService.getRulesetFeatsGrouped(id, { search, childOnly, aptitudeId }, { limit, page }),
        200,
      );
    },
  )
  .get(
    "/:id/feats",
    zValidator("param", idParam),
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
      return c.json(
        await FeatsService.getRulesetFeats(
          id,
          { search, childOnly, aptitudeId, family, orderBy, orderDir },
          { limit, page },
        ),
        200,
      );
    },
  )
  .get(
    "/:id/feats/:featId",
    zValidator("param", z.object({ id: z.string().uuid(), featId: z.string().uuid() })),
    async (c) => {
      const { id, featId } = c.req.valid("param");
      return c.json(await FeatsService.getRulesetFeat(id, featId), 200);
    },
  )
  .post(
    "/:id/feats",
    zValidator("param", idParam),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
        aptitudeIds: z.array(z.string().uuid()).min(1, "At least one aptitude must be selected"),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await FeatsService.createRulesetFeat(c.var.requestSession, id, body), 200);
    },
  )
  .put(
    "/:id/feats/:featId",
    zValidator("param", z.object({ id: z.string().uuid(), featId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
        aptitudeIds: z.array(z.string().uuid()).optional(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, featId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await FeatsService.updateRulesetFeat(c.var.requestSession, id, featId, body), 200);
    },
  )
  .delete(
    "/:id/feats/:featId",
    zValidator("param", z.object({ id: z.string().uuid(), featId: z.string().uuid() })),
    async (c) => {
      const { id, featId } = c.req.valid("param");
      return c.json(await FeatsService.deleteRulesetFeat(c.var.requestSession, id, featId), 200);
    },
  );
