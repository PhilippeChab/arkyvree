import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { MechanicsService } from "@/server/services/rulesets/mechanics/index.ts";

const mechanicParams = idParam.extend({ mechanicId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get(
    "/:id/mechanics",
    validate("param", idParam),
    validate(
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
        await MechanicsService.getMechanics(id, { search, childOnly, orderBy, orderDir }, { limit, page }),
        200,
      );
    },
  )
  .get("/:id/mechanics/:mechanicId", validate("param", mechanicParams), async (c) => {
    const { id, mechanicId } = c.req.valid("param");
    return c.json(await MechanicsService.getMechanic(id, mechanicId), 200);
  })
  .post(
    "/:id/mechanics",
    validate("param", idParam),
    validate(
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
      return c.json(await MechanicsService.createMechanic(c.var.requestSession, id, body), 200);
    },
  )
  .put(
    "/:id/mechanics/:mechanicId",
    validate("param", mechanicParams),
    validate(
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
      return c.json(await MechanicsService.updateMechanic(c.var.requestSession, id, mechanicId, body), 200);
    },
  )
  .delete("/:id/mechanics/:mechanicId", validate("param", mechanicParams), async (c) => {
    const { id, mechanicId } = c.req.valid("param");
    return c.json(await MechanicsService.deleteMechanic(c.var.requestSession, id, mechanicId), 200);
  });
