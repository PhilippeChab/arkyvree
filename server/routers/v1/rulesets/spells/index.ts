import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Spell, v1SpellPage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS } from "@/server/routers/v1/validation.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";

const spellParams = idParam.extend({ spellId: z.string().uuid() });

export default new Hono<ApiKeyContext>()
  .get(
    "/:id/spells",
    describeRoute({ response: v1SpellPage, status: 200, summary: "A ruleset's spells, a page at a time" }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        ...CONTENT_FILTERS,
        aptitudeId: z.string().uuid().optional().meta({ description: "Only those on an aptitude (a spell list)" }),
        level: z.coerce
          .number()
          .int()
          .optional()
          .meta({ description: "Only those at a spell level, with `aptitudeId`" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { aptitudeId, childOnly, level, limit, orderBy, orderDir, page, search } = c.req.valid("query");
      const spells = await PowersService.getPowers(
        id,
        { aptitudeId, childOnly, level, orderBy, orderDir, search },
        { limit, page },
      );
      return c.json(V1.page(spells, V1.spell), 200);
    },
  )
  .get(
    "/:id/spells/:spellId",
    describeRoute({ response: v1Spell, status: 200, summary: "A spell of a ruleset's" }),
    validate("param", spellParams),
    async (c) => {
      const { id, spellId } = c.req.valid("param");
      return c.json(V1.spell(await PowersService.getPower(id, spellId)), 200);
    },
  );
