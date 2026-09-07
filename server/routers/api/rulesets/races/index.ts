import { sizeType } from "@/drizzle/schema.ts";
import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { RacesService } from "@/server/services/rulesets/index.ts";
import { entityOrderBy, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:id/races",
    zValidator("param", z.object({ id: z.string().uuid() })),
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
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/races/:raceId",
    zValidator("param", z.object({ id: z.string().uuid(), raceId: z.string().uuid() })),
    async (c) => {
      const { id, raceId } = c.req.valid("param");

      const racesService = RacesService.initialize();
      const result = await racesService.call("getRulesetRace", id, raceId);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/races",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
        size: z.enum(sizeType.enumValues),
        baseSpeed: z.number(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const racesService = RacesService.initialize();
      const result = await racesService.call(
        "createRulesetRace",
        c.var.requestSession,
        id,
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
  .put(
    "/:id/races/:raceId",
    zValidator("param", z.object({ id: z.string().uuid(), raceId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
        size: z.enum(sizeType.enumValues),
        baseSpeed: z.number(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, raceId } = c.req.valid("param");
      const body = c.req.valid("json");

      const racesService = RacesService.initialize();
      const result = await racesService.call(
        "updateRulesetRace",
        c.var.requestSession,
        id,
        raceId,
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
    "/:id/races/:raceId",
    zValidator("param", z.object({ id: z.string().uuid(), raceId: z.string().uuid() })),
    async (c) => {
      const { id, raceId } = c.req.valid("param");

      const racesService = RacesService.initialize();
      const result = await racesService.call(
        "deleteRulesetRace",
        c.var.requestSession,
        id,
        raceId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
