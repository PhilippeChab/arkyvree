import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Feat, v1FeatPage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS } from "@/server/routers/v1/validation.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";

const featParams = idParam.extend({ featId: z.string().uuid() });

export default new Hono<ApiKeyContext>()
  .get(
    "/:id/feats",
    describeRoute({ response: v1FeatPage, status: 200, summary: "A ruleset's feats, a page at a time" }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        ...CONTENT_FILTERS,
        aptitudeId: z.string().uuid().optional().meta({ description: "Only those picked in an aptitude" }),
        family: z.string().optional().meta({ description: "Only those of a family (`Weapon Focus`)" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { aptitudeId, childOnly, family, limit, orderBy, orderDir, page, search } = c.req.valid("query");
      const feats = await FeatsService.getFeats(
        id,
        { aptitudeId, childOnly, family, orderBy, orderDir, search },
        { limit, page },
      );
      return c.json(V1.page(feats, V1.feat), 200);
    },
  )
  .get(
    "/:id/feats/:featId",
    describeRoute({ response: v1Feat, status: 200, summary: "A feat of a ruleset's" }),
    validate("param", featParams),
    async (c) => {
      const { id, featId } = c.req.valid("param");
      return c.json(V1.feat(await FeatsService.getFeat(id, featId)), 200);
    },
  );
