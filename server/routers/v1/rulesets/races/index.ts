import { Hono } from "hono";
import { z } from "zod";

import { sizeType } from "@/drizzle/schema.ts";
import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Race, v1RacePage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS, entityDescription, fields } from "@/server/routers/v1/validation.ts";
import { RacesService } from "@/server/services/rulesets/races/index.ts";

/** A race, its create's and its update's. */
const raceBody = z.object({
  description: entityDescription,
  fields,
  name: z.string().min(1),
  size: z.enum(sizeType.enumValues),
  speed: z.number().int().min(1).meta({ description: "In feet" }),
});

const raceParams = idParam.extend({ raceId: z.string().uuid() });

export default new Hono<ApiKeyContext>()
  .get(
    "/:id/races",
    describeRoute({ response: v1RacePage, status: 200, summary: "A ruleset's races, a page at a time" }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        ...CONTENT_FILTERS,
        kind: z.string().optional().meta({ description: "Only those of a kind: `pc`, `npc`, a bonded creature's" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { childOnly, kind, limit, orderBy, orderDir, page, search } = c.req.valid("query");
      const races = await RacesService.getRaces(id, { childOnly, kind, orderBy, orderDir, search }, { limit, page });
      return c.json(V1.page(races, V1.race), 200);
    },
  )
  .get(
    "/:id/races/:raceId",
    describeRoute({ response: v1Race, status: 200, summary: "A race of a ruleset's" }),
    validate("param", raceParams),
    async (c) => {
      const { id, raceId } = c.req.valid("param");
      return c.json(V1.race(await RacesService.getRace(id, raceId)), 200);
    },
  )
  .post(
    "/:id/races",
    describeRoute({ response: v1Race, status: 201, summary: "Adds a race to a ruleset" }),
    validate("param", idParam),
    validate("json", raceBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await RacesService.createRace(c.var.requestSession, id, V1.raceRequest(body));
      return c.json(V1.race(await RacesService.getRace(id, created.id)), 201);
    },
  )
  .put(
    "/:id/races/:raceId",
    describeRoute({
      response: v1Race,
      status: 200,
      summary: "Changes a race of a ruleset's: a copy of its own, when it's inherited",
    }),
    validate("param", raceParams),
    validate("json", raceBody),
    async (c) => {
      const { id, raceId } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await RacesService.updateRace(c.var.requestSession, id, raceId, V1.raceRequest(body));
      return c.json(V1.race(await RacesService.getRace(id, updated.id)), 200);
    },
  )
  .delete(
    "/:id/races/:raceId",
    describeRoute({
      response: null,
      status: 204,
      summary: "Deletes a race of a ruleset's: refused while a character has it",
    }),
    validate("param", raceParams),
    async (c) => {
      const { id, raceId } = c.req.valid("param");
      await RacesService.deleteRace(c.var.requestSession, id, raceId);
      return c.body(null, 204);
    },
  );
