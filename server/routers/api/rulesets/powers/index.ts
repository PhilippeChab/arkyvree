import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { PowersService } from "@/server/services/rulesets/index.ts";
import { entityOrderBy, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

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
    zValidator("param", z.object({ id: z.string().uuid() })),
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

      const powersService = PowersService.initialize();
      const result = await powersService.call("getRulesetPowers", id, { search, childOnly, aptitudeId, level, orderBy, orderDir }, { limit, page });
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/powers/:powerId",
    zValidator("param", z.object({ id: z.string().uuid(), powerId: z.string().uuid() })),
    async (c) => {
      const { id, powerId } = c.req.valid("param");

      const powersService = PowersService.initialize();
      const result = await powersService.call("getRulesetPower", id, powerId);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/powers",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
        aptitudes: z.array(z.object({
          id: z.string().uuid(),
          level: z.number().int().min(0).max(9).optional(),
        })).min(1, "At least one aptitude must be selected"),
        saveId: z.string().uuid().nullable().optional(),
        saveEffect: z.string().nullable().optional(),
        ...spellFields,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const powersService = PowersService.initialize();
      const result = await powersService.call("createRulesetPower", c.var.requestSession, id, body);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .put(
    "/:id/powers/:powerId",
    zValidator("param", z.object({ id: z.string().uuid(), powerId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
        aptitudes: z.array(z.object({
          id: z.string().uuid(),
          level: z.number().int().min(0).max(9).optional(),
        })).optional(),
        saveId: z.string().uuid().nullable().optional(),
        saveEffect: z.string().nullable().optional(),
        ...spellFields,
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, powerId } = c.req.valid("param");
      const body = c.req.valid("json");

      const powersService = PowersService.initialize();
      const result = await powersService.call(
        "updateRulesetPower",
        c.var.requestSession,
        id,
        powerId,
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
    "/:id/powers/:powerId",
    zValidator("param", z.object({ id: z.string().uuid(), powerId: z.string().uuid() })),
    async (c) => {
      const { id, powerId } = c.req.valid("param");

      const powersService = PowersService.initialize();
      const result = await powersService.call("deleteRulesetPower", c.var.requestSession, id, powerId);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
