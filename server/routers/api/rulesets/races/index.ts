import { Hono } from "hono";
import { z } from "zod";

import { sizeType } from "@/drizzle/schema.ts";
import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { RacesService } from "@/server/services/rulesets/races/index.ts";

/** A race's base speed, in feet: a whole number above 0, as its column holds it. */
const baseSpeed = z.number().int().min(1);

const raceParams = idParam.extend({ raceId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get(
    "/:id/races",
    validate("param", idParam),
    validate(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        kind: z.string().optional(),
        orderBy: entityOrderBy,
        orderDir: orderDirAsc,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, childOnly, kind, orderBy, orderDir } = c.req.valid("query");
      return c.json(
        await RacesService.getRaces(id, { search, childOnly, kind, orderBy, orderDir }, { limit, page }),
        200,
      );
    },
  )
  .get("/:id/races/:raceId", validate("param", raceParams), async (c) => {
    const { id, raceId } = c.req.valid("param");
    return c.json(await RacesService.getRace(id, raceId), 200);
  })
  .post(
    "/:id/races",
    validate("param", idParam),
    validate(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
        size: z.enum(sizeType.enumValues),
        baseSpeed: baseSpeed,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await RacesService.createRace(c.var.requestSession, id, body), 200);
    },
  )
  .put(
    "/:id/races/:raceId",
    validate("param", raceParams),
    validate(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
        size: z.enum(sizeType.enumValues),
        baseSpeed: baseSpeed,
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, raceId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await RacesService.updateRace(c.var.requestSession, id, raceId, body), 200);
    },
  )
  .delete("/:id/races/:raceId", validate("param", raceParams), async (c) => {
    const { id, raceId } = c.req.valid("param");
    return c.json(await RacesService.deleteRace(c.var.requestSession, id, raceId), 200);
  });
