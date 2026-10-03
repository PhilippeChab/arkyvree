import { Hono } from "hono";
import { z } from "zod";

import { location } from "@/drizzle/schema.ts";
import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { characterIdParam } from "@/server/routers/api/validation.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";

const inventory = new Hono<SessionContext>()
  .get("/:characterId", zValidator("param", characterIdParam), async (c) => {
    const { characterId } = c.req.valid("param");
    return c.json(await CharacterInventoryService.getInventory(c.var.requestSession, characterId), 200);
  })
  .post(
    "/:characterId",
    zValidator("param", characterIdParam),
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
      return c.json(
        await CharacterInventoryService.addItem(
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
        ),
        201,
      );
    },
  )
  .put(
    "/:characterId/:itemId",
    zValidator("param", z.object({ characterId: z.string().uuid(), itemId: z.string().uuid() })),
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
      return c.json(
        await CharacterInventoryService.updateItem(
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
        ),
        200,
      );
    },
  )
  .delete(
    "/:characterId/:itemId",
    zValidator("param", z.object({ characterId: z.string().uuid(), itemId: z.string().uuid() })),
    async (c) => {
      const { characterId, itemId } = c.req.valid("param");
      return c.json(await CharacterInventoryService.removeItem(c.var.requestSession, characterId, itemId), 200);
    },
  );

export default inventory;
