import { Hono } from "hono";
import { z } from "zod";

import { location } from "@/drizzle/schema.ts";
import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Item, v1ItemPage, v1Items } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS, entityDescription, fields, flag } from "@/server/routers/v1/validation.ts";
import { ItemsService } from "@/server/services/rulesets/items/index.ts";

/**
 * An item, its create's, its duplicate's and its update's: a cost, a weight, a slot or a template cleared with null,
 * and kept when left out. Whether it's a template is a new item's alone (`template`): an update leaves it as it is.
 */
const itemBody = z.object({
  cost: z.number().min(0).nullable().optional().meta({ description: "In gold pieces" }),
  description: entityDescription,
  fields,
  name: z.string().min(1),
  slot: z.enum(location.enumValues).nullable().optional().meta({ description: "Where it's worn or held" }),
  template: z.boolean().optional().meta({ description: "Whether it's a template other items are made from" }),
  templateId: z.string().uuid().nullable().optional().meta({ description: "The template it's made from" }),
  type: z
    .string()
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value))
    .meta({ description: "`Weapon`, `Armor`, `Shield`…" }),
  weight: z.number().min(0).nullable().optional().meta({ description: "In pounds" }),
});

const itemParams = idParam.extend({ itemId: z.string().uuid() });

export default new Hono<ApiKeyContext>()
  .get(
    "/:id/item-templates",
    describeRoute({
      response: v1Items,
      status: 200,
      summary: "A ruleset's item templates, the items others are made from (Longsword), of a type if it says",
    }),
    validate("param", idParam),
    validate(
      "query",
      z.object({ type: z.string().optional().meta({ description: "Only those of a type: `Weapon`" }) }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { type } = c.req.valid("query");
      return c.json((await ItemsService.getTemplates(id, type)).map(V1.item), 200);
    },
  )
  .get(
    "/:id/items",
    describeRoute({ response: v1ItemPage, status: 200, summary: "A ruleset's items, a page at a time" }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        ...CONTENT_FILTERS,
        template: flag.meta({ description: "Only templates (`true`), or only the items made from them (`false`)" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { childOnly, limit, orderBy, orderDir, page, search, template } = c.req.valid("query");
      const items = await ItemsService.getItems(
        id,
        { childOnly, isTemplate: template, orderBy, orderDir, search },
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
  )
  .post(
    "/:id/items",
    describeRoute({ response: v1Item, status: 201, summary: "Adds an item to a ruleset" }),
    validate("param", idParam),
    validate("json", itemBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await ItemsService.createItem(c.var.requestSession, id, V1.itemRequest(body));
      return c.json(V1.item(await ItemsService.getItem(id, created.id)), 201);
    },
  )
  .post(
    "/:id/items/:itemId/duplicate",
    describeRoute({
      response: v1Item,
      status: 201,
      summary:
        "Adds a copy of an item to a ruleset, with its modifiers and requirements: the body is the copy's, as a create's",
    }),
    validate("param", itemParams),
    validate("json", itemBody),
    async (c) => {
      const { id, itemId } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await ItemsService.duplicateItem(c.var.requestSession, id, itemId, V1.itemRequest(body));
      return c.json(V1.item(await ItemsService.getItem(id, created.id)), 201);
    },
  )
  .post(
    "/:id/items/:itemId/variants",
    describeRoute({
      response: v1Items,
      status: 201,
      summary: "Adds items made from a template, one per variant (a Longsword +1), each with its name",
    }),
    validate("param", itemParams),
    validate(
      "json",
      z.object({
        variants: z.array(z.object({ description: entityDescription, name: z.string().min(1) })).min(1),
      }),
    ),
    async (c) => {
      const { id, itemId } = c.req.valid("param");
      const { variants } = c.req.valid("json");
      const created = await ItemsService.createVariants(c.var.requestSession, id, itemId, variants);
      // Each read back as its read answers it, with the fields it takes from its template, one after another: the
      // ruleset's cached view answers all but the first, and a body's many variants hold one connection
      const items = [];
      for (const variant of created) items.push(V1.item(await ItemsService.getItem(id, variant.id)));
      return c.json(items, 201);
    },
  )
  .put(
    "/:id/items/:itemId",
    describeRoute({
      response: v1Item,
      status: 200,
      summary: "Changes an item of a ruleset's: a copy of its own, when it's inherited",
    }),
    validate("param", itemParams),
    validate("json", itemBody.omit({ template: true })),
    async (c) => {
      const { id, itemId } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await ItemsService.updateItem(c.var.requestSession, id, itemId, V1.itemRequest(body));
      return c.json(V1.item(await ItemsService.getItem(id, updated.id)), 200);
    },
  )
  .delete(
    "/:id/items/:itemId",
    describeRoute({
      response: null,
      status: 204,
      summary: "Deletes an item of a ruleset's: refused while a character carries it, or items are made from it",
    }),
    validate("param", itemParams),
    async (c) => {
      const { id, itemId } = c.req.valid("param");
      await ItemsService.deleteItem(c.var.requestSession, id, itemId);
      return c.body(null, 204);
    },
  );
