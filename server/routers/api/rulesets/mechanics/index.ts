import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { MechanicsService } from "@/server/services/rulesets/index.ts";

export default new Hono<SessionContext>()
  .get(
    "/:id/mechanics",
    zValidator("param", idParam),
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
      return c.json(
        await MechanicsService.getRulesetMechanics(id, { search, childOnly, orderBy, orderDir }, { limit, page }),
        200,
      );
    },
  )
  .get(
    "/:id/mechanics/:mechanicId",
    zValidator("param", z.object({ id: z.string().uuid(), mechanicId: z.string().uuid() })),
    async (c) => {
      const { id, mechanicId } = c.req.valid("param");
      return c.json(await MechanicsService.getRulesetMechanic(id, mechanicId), 200);
    },
  )
  .post(
    "/:id/mechanics",
    zValidator("param", idParam),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await MechanicsService.createRulesetMechanic(c.var.requestSession, id, body), 200);
    },
  )
  .put(
    "/:id/mechanics/:mechanicId",
    zValidator("param", z.object({ id: z.string().uuid(), mechanicId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, mechanicId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await MechanicsService.updateRulesetMechanic(c.var.requestSession, id, mechanicId, body), 200);
    },
  )
  .delete(
    "/:id/mechanics/:mechanicId",
    zValidator("param", z.object({ id: z.string().uuid(), mechanicId: z.string().uuid() })),
    async (c) => {
      const { id, mechanicId } = c.req.valid("param");
      return c.json(await MechanicsService.deleteRulesetMechanic(c.var.requestSession, id, mechanicId), 200);
    },
  );
