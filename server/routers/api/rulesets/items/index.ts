import { location } from "@/drizzle/schema.ts";
import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { ItemsService } from "@/server/services/rulesets/index.ts";
import { entityOrderBy, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

const itemBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().transform(v => v || null),
  costGp: z.number().min(0).nullable().optional().transform((v) => v ?? undefined),
  weight: z.number().min(0).nullable().optional().transform((v) => v ?? undefined),
  type: z.string().nullable().optional(),
  slot: z.union([z.enum(location.enumValues), z.literal("")]).optional().transform((v) => v || undefined),
  sourceItemId: z.string().uuid().optional(),
  isTemplate: z.boolean().optional(),
  updatedAt: z.string().optional(),
});

export default new Hono<SessionContext>()
  .get(
    "/:id/items",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        orderBy: entityOrderBy,
        orderDir: orderDirAsc,
        isTemplate: z.enum(["true", "false"]).optional().transform((v) =>
          v === "true" ? true : v === "false" ? false : undefined
        ),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, childOnly, orderBy, orderDir, isTemplate } = c.req.valid("query");

      const itemsService = ItemsService.initialize();
      const result = await itemsService.call("getRulesetItems", id, { search, childOnly, orderBy, orderDir, isTemplate }, { limit, page });
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/templates",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        type: z.enum(["Weapon", "Armor", "Shield"]).optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { type } = c.req.valid("query");

      const itemsService = ItemsService.initialize();
      const result = await itemsService.call("getRulesetTemplates", id, type);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/items/:itemId",
    zValidator("param", z.object({ id: z.string().uuid(), itemId: z.string().uuid() })),
    async (c) => {
      const { id, itemId } = c.req.valid("param");

      const itemsService = ItemsService.initialize();
      const result = await itemsService.call("getRulesetItem", id, itemId);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/items",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator("json", itemBodySchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const itemsService = ItemsService.initialize();
      const result = await itemsService.call("createRulesetItem", c.var.requestSession, id, body);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/items/:itemId/duplicate",
    zValidator("param", z.object({ id: z.string().uuid(), itemId: z.string().uuid() })),
    zValidator("json", itemBodySchema),
    async (c) => {
      const { id, itemId } = c.req.valid("param");
      const body = c.req.valid("json");

      const itemsService = ItemsService.initialize();
      const result = await itemsService.call("duplicateRulesetItem", c.var.requestSession, id, itemId, body);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/items/:itemId/variants",
    zValidator("param", z.object({ id: z.string().uuid(), itemId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        variants: z.array(
          z.object({
            name: z.string().min(1),
            description: z.string().optional().transform((v) => v || null),
          }),
        ).min(1).max(50),
      }),
    ),
    async (c) => {
      const { id, itemId } = c.req.valid("param");
      const { variants } = c.req.valid("json");

      const itemsService = ItemsService.initialize();
      const result = await itemsService.call("bulkCreateVariants", c.var.requestSession, id, itemId, variants);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .put(
    "/:id/items/:itemId",
    zValidator("param", z.object({ id: z.string().uuid(), itemId: z.string().uuid() })),
    zValidator("json", itemBodySchema),
    async (c) => {
      const { id, itemId } = c.req.valid("param");
      const body = c.req.valid("json");

      const itemsService = ItemsService.initialize();
      const result = await itemsService.call(
        "updateRulesetItem",
        c.var.requestSession,
        id,
        itemId,
        body,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .delete(
    "/:id/items/:itemId",
    zValidator("param", z.object({ id: z.string().uuid(), itemId: z.string().uuid() })),
    async (c) => {
      const { id, itemId } = c.req.valid("param");

      const itemsService = ItemsService.initialize();
      const result = await itemsService.call("deleteRulesetItem", c.var.requestSession, id, itemId);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
