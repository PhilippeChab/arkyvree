import { Hono } from "hono";
import { z } from "zod";

import { sizeType } from "@/drizzle/schema.ts";
import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { respond } from "@/server/routers/respond.ts";
import { RacesService } from "@/server/services/rulesets/index.ts";

export default new Hono<SessionContext>()
  .get(
    "/:id/races",
    zValidator("param", idParam),
    zValidator(
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

      const racesService = RacesService.initialize();
      const result = await racesService.call(
        "getRulesetRaces",
        id,
        { search, childOnly, kind, orderBy, orderDir },
        { limit, page },
      );
      return respond(c, result, 200);
    },
  )
  .get(
    "/:id/races/:raceId",
    zValidator("param", z.object({ id: z.string().uuid(), raceId: z.string().uuid() })),
    async (c) => {
      const { id, raceId } = c.req.valid("param");

      const racesService = RacesService.initialize();
      const result = await racesService.call("getRulesetRace", id, raceId);
      return respond(c, result, 200);
    },
  )
  .post(
    "/:id/races",
    zValidator("param", idParam),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
        size: z.enum(sizeType.enumValues),
        baseSpeed: z.number(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const racesService = RacesService.initialize();
      const result = await racesService.call("createRulesetRace", c.var.requestSession, id, body);
      return respond(c, result, 200);
    },
  )
  .put(
    "/:id/races/:raceId",
    zValidator("param", z.object({ id: z.string().uuid(), raceId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
        size: z.enum(sizeType.enumValues),
        baseSpeed: z.number(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, raceId } = c.req.valid("param");
      const body = c.req.valid("json");

      const racesService = RacesService.initialize();
      const result = await racesService.call("updateRulesetRace", c.var.requestSession, id, raceId, body);
      return respond(c, result, 200);
    },
  )
  .delete(
    "/:id/races/:raceId",
    zValidator("param", z.object({ id: z.string().uuid(), raceId: z.string().uuid() })),
    async (c) => {
      const { id, raceId } = c.req.valid("param");

      const racesService = RacesService.initialize();
      const result = await racesService.call("deleteRulesetRace", c.var.requestSession, id, raceId);
      return respond(c, result, 200);
    },
  );
