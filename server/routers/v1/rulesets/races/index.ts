import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Race, v1RacePage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS } from "@/server/routers/v1/validation.ts";
import { RacesService } from "@/server/services/rulesets/races/index.ts";

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
  );
