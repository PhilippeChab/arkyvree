import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { MechanicsService } from "@/server/services/rulesets/index.ts";
import { entityOrderBy, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:id/mechanics",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        orderBy: entityOrderBy,
        orderDir: orderDirAsc,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, childOnly, orderBy, orderDir } = c.req.valid("query");

      const mechanicsService = MechanicsService.initialize();
      const result = await mechanicsService.call("getRulesetMechanics", id, { search, childOnly, orderBy, orderDir }, { limit, page });
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/mechanics/:mechanicId",
    zValidator("param", z.object({ id: z.string().uuid(), mechanicId: z.string().uuid() })),
    async (c) => {
      const { id, mechanicId } = c.req.valid("param");

      const mechanicsService = MechanicsService.initialize();
      const result = await mechanicsService.call("getRulesetMechanic", id, mechanicId);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/mechanics",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const mechanicsService = MechanicsService.initialize();
      const result = await mechanicsService.call("createRulesetMechanic", c.var.requestSession, id, body);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .put(
    "/:id/mechanics/:mechanicId",
    zValidator("param", z.object({ id: z.string().uuid(), mechanicId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, mechanicId } = c.req.valid("param");
      const body = c.req.valid("json");

      const mechanicsService = MechanicsService.initialize();
      const result = await mechanicsService.call(
        "updateRulesetMechanic",
        c.var.requestSession,
        id,
        mechanicId,
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
    "/:id/mechanics/:mechanicId",
    zValidator("param", z.object({ id: z.string().uuid(), mechanicId: z.string().uuid() })),
    async (c) => {
      const { id, mechanicId } = c.req.valid("param");

      const mechanicsService = MechanicsService.initialize();
      const result = await mechanicsService.call(
        "deleteRulesetMechanic",
        c.var.requestSession,
        id,
        mechanicId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
