import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";

const spellFields = {
  school: z.string().optional(),
  subschool: z.string().optional(),
  descriptors: z.array(z.string()).optional(),
  castingTime: z.string().optional(),
  rangeType: z.string().optional(),
  target: z.string().optional(),
  areaOfEffect: z.string().optional(),
  duration: z.string().optional(),
  spellResistance: z.string().optional(),
  components: z.array(z.string()).optional(),
};

export default new Hono<SessionContext>()
  .get(
    "/:id/powers",
    zValidator("param", idParam),
    zValidator(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        aptitudeId: z.string().uuid().optional(),
        level: z.coerce.number().min(0).max(9).optional(),
        orderBy: entityOrderBy,
        orderDir: orderDirAsc,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, childOnly, aptitudeId, level, orderBy, orderDir } = c.req.valid("query");
      return c.json(
        await PowersService.getRulesetPowers(
          id,
          { search, childOnly, aptitudeId, level, orderBy, orderDir },
          { limit, page },
        ),
        200,
      );
    },
  )
  .get(
    "/:id/powers/:powerId",
    zValidator("param", z.object({ id: z.string().uuid(), powerId: z.string().uuid() })),
    async (c) => {
      const { id, powerId } = c.req.valid("param");
      return c.json(await PowersService.getRulesetPower(id, powerId), 200);
    },
  )
  .post(
    "/:id/powers",
    zValidator("param", idParam),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
        aptitudes: z
          .array(
            z.object({
              id: z.string().uuid(),
              level: z.number().int().min(0).max(9).optional(),
            }),
          )
          .min(1, "At least one aptitude must be selected"),
        saveId: z.string().uuid().nullable().optional(),
        saveEffect: z.string().nullable().optional(),
        ...spellFields,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await PowersService.createRulesetPower(c.var.requestSession, id, body), 200);
    },
  )
  .put(
    "/:id/powers/:powerId",
    zValidator("param", z.object({ id: z.string().uuid(), powerId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
        aptitudes: z
          .array(
            z.object({
              id: z.string().uuid(),
              level: z.number().int().min(0).max(9).optional(),
            }),
          )
          .optional(),
        saveId: z.string().uuid().nullable().optional(),
        saveEffect: z.string().nullable().optional(),
        ...spellFields,
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, powerId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await PowersService.updateRulesetPower(c.var.requestSession, id, powerId, body), 200);
    },
  )
  .delete(
    "/:id/powers/:powerId",
    zValidator("param", z.object({ id: z.string().uuid(), powerId: z.string().uuid() })),
    async (c) => {
      const { id, powerId } = c.req.valid("param");
      return c.json(await PowersService.deleteRulesetPower(c.var.requestSession, id, powerId), 200);
    },
  );
