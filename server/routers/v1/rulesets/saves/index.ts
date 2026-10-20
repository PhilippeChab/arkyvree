import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Save, v1SavePage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS } from "@/server/routers/v1/validation.ts";
import { SavesService } from "@/server/services/rulesets/saves/index.ts";

const saveParams = idParam.extend({ saveId: z.string().uuid() });

export default new Hono<ApiKeyContext>()
  .get(
    "/:id/saves",
    describeRoute({ response: v1SavePage, status: 200, summary: "A ruleset's saving throws, a page at a time" }),
    validate("param", idParam),
    validate("query", z.object(CONTENT_FILTERS)),
    async (c) => {
      const { id } = c.req.valid("param");
      const { childOnly, limit, orderBy, orderDir, page, search } = c.req.valid("query");
      const saves = await SavesService.getSaves(id, { childOnly, orderBy, orderDir, search }, { limit, page });
      return c.json(V1.page(saves, V1.save), 200);
    },
  )
  .get(
    "/:id/saves/:saveId",
    describeRoute({ response: v1Save, status: 200, summary: "A saving throw of a ruleset's" }),
    validate("param", saveParams),
    async (c) => {
      const { id, saveId } = c.req.valid("param");
      return c.json(V1.save(await SavesService.getSave(id, saveId)), 200);
    },
  );
