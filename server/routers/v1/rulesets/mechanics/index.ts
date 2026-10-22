import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Mechanic, v1MechanicPage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS } from "@/server/routers/v1/validation.ts";
import { MechanicsService } from "@/server/services/rulesets/mechanics/index.ts";

const mechanicParams = idParam.extend({ mechanicId: z.string().uuid() });

export default new Hono<ApiKeyContext>()
  .get(
    "/:id/mechanics",
    describeRoute({ response: v1MechanicPage, status: 200, summary: "A ruleset's mechanics, a page at a time" }),
    validate("param", idParam),
    validate("query", z.object(CONTENT_FILTERS)),
    async (c) => {
      const { id } = c.req.valid("param");
      const { childOnly, limit, orderBy, orderDir, page, search } = c.req.valid("query");
      const mechanics = await MechanicsService.getMechanics(
        id,
        { childOnly, orderBy, orderDir, search },
        { limit, page },
      );
      return c.json(V1.page(mechanics, V1.entity), 200);
    },
  )
  .get(
    "/:id/mechanics/:mechanicId",
    describeRoute({ response: v1Mechanic, status: 200, summary: "A mechanic of a ruleset's" }),
    validate("param", mechanicParams),
    async (c) => {
      const { id, mechanicId } = c.req.valid("param");
      return c.json(V1.entity(await MechanicsService.getMechanic(id, mechanicId)), 200);
    },
  );
