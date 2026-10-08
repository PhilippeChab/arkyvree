import { Hono } from "hono";
import { z } from "zod";

import { location } from "@/drizzle/schema.ts";
import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { ItemsService } from "@/server/services/rulesets/items/index.ts";
import { TEMPLATE_ITEM_TYPES } from "@/shared/itemTemplates.ts";

const itemBody = z.object({
  name: z.string().min(1),
  description: z
    .string()
    .optional()
    .transform((v) => v || null),
  costGp: z
    .number()
    .min(0)
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  weight: z
    .number()
    .min(0)
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  type: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null),
  slot: z
    .union([z.enum(location.enumValues), z.literal("")])
    .optional()
    .transform((v) => v || undefined),
  sourceItemId: z.string().uuid().optional(),
  isTemplate: z.boolean().optional(),
  updatedAt: z.string().optional(),
});

const itemParams = idParam.extend({ itemId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get(
    "/:id/items",
    validate("param", idParam),
    validate(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        orderBy: entityOrderBy,
        orderDir: orderDirAsc,
        isTemplate: z
          .enum(["true", "false"])
          .optional()
          .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, childOnly, orderBy, orderDir, isTemplate } = c.req.valid("query");
      return c.json(
        await ItemsService.getItems(id, { search, childOnly, orderBy, orderDir, isTemplate }, { limit, page }),
        200,
      );
    },
  )
  .get("/:id/items/:itemId", validate("param", itemParams), async (c) => {
    const { id, itemId } = c.req.valid("param");
    return c.json(await ItemsService.getItem(id, itemId), 200);
  })
  .get(
    "/:id/templates",
    validate("param", idParam),
    validate(
      "query",
      z.object({
        type: z.enum(TEMPLATE_ITEM_TYPES).optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { type } = c.req.valid("query");
      return c.json(await ItemsService.getTemplates(id, type), 200);
    },
  )
  .post("/:id/items", validate("param", idParam), validate("json", itemBody), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await ItemsService.createItem(c.var.requestSession, id, body), 200);
  })
  .post("/:id/items/:itemId/duplicate", validate("param", itemParams), validate("json", itemBody), async (c) => {
    const { id, itemId } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await ItemsService.duplicateItem(c.var.requestSession, id, itemId, body), 200);
  })
  .post(
    "/:id/items/:itemId/variants",
    validate("param", itemParams),
    validate(
      "json",
      z.object({
        variants: z
          .array(
            z.object({
              name: z.string().min(1),
              description: z
                .string()
                .optional()
                .transform((v) => v || null),
            }),
          )
          .min(1)
          .max(50),
      }),
    ),
    async (c) => {
      const { id, itemId } = c.req.valid("param");
      const { variants } = c.req.valid("json");
      return c.json(await ItemsService.createVariants(c.var.requestSession, id, itemId, variants), 200);
    },
  )
  .put("/:id/items/:itemId", validate("param", itemParams), validate("json", itemBody), async (c) => {
    const { id, itemId } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await ItemsService.updateItem(c.var.requestSession, id, itemId, body), 200);
  })
  .delete("/:id/items/:itemId", validate("param", itemParams), async (c) => {
    const { id, itemId } = c.req.valid("param");
    return c.json(await ItemsService.deleteItem(c.var.requestSession, id, itemId), 200);
  });
