import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Item, v1ItemPage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS, flag } from "@/server/routers/v1/validation.ts";
import { ItemsService } from "@/server/services/rulesets/items/index.ts";

const itemParams = idParam.extend({ itemId: z.string().uuid() });

export default new Hono<ApiKeyContext>()
  .get(
    "/:id/items",
    describeRoute({ response: v1ItemPage, status: 200, summary: "A ruleset's items, a page at a time" }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        ...CONTENT_FILTERS,
        template: flag.meta({ description: "Only templates (`true`), or only the items made from them (`false`)" }),
        type: z.string().optional().meta({ description: "Only those of a type: `Weapon`" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { childOnly, limit, orderBy, orderDir, page, search, template, type } = c.req.valid("query");
      const items = await ItemsService.getItems(
        id,
        { childOnly, isTemplate: template, orderBy, orderDir, search, type },
        { limit, page },
      );
      return c.json(V1.page(items, V1.item), 200);
    },
  )
  .get(
    "/:id/items/:itemId",
    describeRoute({ response: v1Item, status: 200, summary: "An item of a ruleset's" }),
    validate("param", itemParams),
    async (c) => {
      const { id, itemId } = c.req.valid("param");
      return c.json(V1.item(await ItemsService.getItem(id, itemId)), 200);
    },
  );
