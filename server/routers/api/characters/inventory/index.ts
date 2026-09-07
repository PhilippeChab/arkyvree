import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { location } from "@/drizzle/schema.ts";
import { CharacterInventoryService } from "@/server/services/characters/index.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

const inventory = new Hono<SessionContext>()
  .get(
    "/:characterId",
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const result = await CharacterInventoryService.initialize().call(
        "getInventory",
        c.var.requestSession,
        characterId,
      );

      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:characterId",
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        itemId: z.string().uuid(),
        quantity: z.number().int().min(1),
        equipped: z.boolean().default(false),
        location: z.enum(location.enumValues).nullable().default(null),
        totalCharges: z.number().int().min(0).nullable().default(null),
        remainingCharges: z.number().int().min(0).nullable().default(null),
        weaponSet: z.number().int().min(0).nullable().default(null),
        force: z.boolean().default(false),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { itemId, quantity, equipped, location, totalCharges, remainingCharges, weaponSet, force } =
        c.req.valid("json");
      const result = await CharacterInventoryService.initialize().call(
        "addItem",
        c.var.requestSession,
        characterId,
        itemId,
        quantity,
        equipped,
        location,
        totalCharges,
        remainingCharges,
        weaponSet,
        force,
      );

      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 201);
    },
  )
  .put(
    "/:characterId/:itemId",
    zValidator(
      "param",
      z.object({ characterId: z.string().uuid(), itemId: z.string().uuid() }),
    ),
    zValidator(
      "json",
      z.object({
        quantity: z.number().int().min(1),
        equipped: z.boolean(),
        location: z.enum(location.enumValues).nullable().default(null),
        totalCharges: z.number().int().min(0).nullable().default(null),
        remainingCharges: z.number().int().min(0).nullable().default(null),
        weaponSet: z.number().int().min(0).nullable().default(null),
        force: z.boolean().default(false),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { characterId, itemId } = c.req.valid("param");
      const { quantity, equipped, location, totalCharges, remainingCharges, weaponSet, force, updatedAt } =
        c.req.valid("json");
      const result = await CharacterInventoryService.initialize().call(
        "updateItem",
        c.var.requestSession,
        characterId,
        itemId,
        quantity,
        equipped,
        location,
        totalCharges,
        remainingCharges,
        weaponSet,
        force,
        updatedAt,
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
    "/:characterId/:itemId",
    zValidator(
      "param",
      z.object({ characterId: z.string().uuid(), itemId: z.string().uuid() }),
    ),
    async (c) => {
      const { characterId, itemId } = c.req.valid("param");
      const result = await CharacterInventoryService.initialize().call(
        "removeItem",
        c.var.requestSession,
        characterId,
        itemId,
      );

      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );

export default inventory;
