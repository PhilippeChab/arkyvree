import { Hono } from "hono";
import { z } from "zod";

import { location } from "@/drizzle/schema.ts";
import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { characterIdParam } from "@/server/routers/api/validation.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";

const entryParams = characterIdParam.extend({ entryId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get("/:characterId", validate("param", characterIdParam), async (c) => {
    const { characterId } = c.req.valid("param");
    return c.json(await CharacterInventoryService.getInventory(c.var.requestSession, characterId), 200);
  })
  .get(
    "/:characterId/placement",
    validate("param", characterIdParam),
    validate(
      "query",
      z.object({
        entryId: z.string().uuid().optional(),
        location: z.enum(location.enumValues),
        weaponSet: z.coerce.number().int().min(0),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { entryId, location, weaponSet } = c.req.valid("query");
      return c.json(
        await CharacterInventoryService.getPlacement(
          c.var.requestSession,
          characterId,
          entryId ?? null,
          location,
          weaponSet,
        ),
        200,
      );
    },
  )
  .post(
    "/:characterId",
    validate("param", characterIdParam),
    validate(
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
    "/:characterId/:entryId",
    validate("param", entryParams),
    validate(
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
      const { characterId, entryId } = c.req.valid("param");
      const { quantity, equipped, location, totalCharges, remainingCharges, weaponSet, force, updatedAt } =
        c.req.valid("json");
      return c.json(
        await CharacterInventoryService.updateItem(
          c.var.requestSession,
          characterId,
          entryId,
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
  .delete("/:characterId/:entryId", validate("param", entryParams), async (c) => {
    const { characterId, entryId } = c.req.valid("param");
    return c.json(await CharacterInventoryService.removeItem(c.var.requestSession, characterId, entryId), 200);
  });
