import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Ability, v1AbilityPage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS } from "@/server/routers/v1/validation.ts";
import { AbilitiesService } from "@/server/services/rulesets/abilities/index.ts";

const abilityParams = idParam.extend({ abilityId: z.string().uuid() });

export default new Hono<ApiKeyContext>()
  .get(
    "/:id/abilities",
    describeRoute({
      response: v1AbilityPage,
      status: 200,
      summary: "A ruleset's abilities (Strength), a page at a time",
    }),
    validate("param", idParam),
    validate("query", z.object(CONTENT_FILTERS)),
    async (c) => {
      const { id } = c.req.valid("param");
      const { childOnly, limit, orderBy, orderDir, page, search } = c.req.valid("query");
      const abilities = await AbilitiesService.getAbilities(
        id,
        { childOnly, orderBy, orderDir, search },
        { limit, page },
      );
      return c.json(V1.page(abilities, V1.entity), 200);
    },
  )
  .get(
    "/:id/abilities/:abilityId",
    describeRoute({ response: v1Ability, status: 200, summary: "An ability of a ruleset's" }),
    validate("param", abilityParams),
    async (c) => {
      const { id, abilityId } = c.req.valid("param");
      return c.json(V1.entity(await AbilitiesService.getAbility(id, abilityId)), 200);
    },
  );
