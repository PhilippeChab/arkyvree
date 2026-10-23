import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { characterIdParam } from "@/server/routers/api/validation.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import { LOCATION_OPTIONS } from "@/shared/enums.ts";

const entryParams = characterIdParam.extend({ entryId: z.string().uuid() });

/** Comma-separated weapon sets, stored from 0: what isn't one is dropped (an empty string is none). */
const heldSetList = z.string().transform((value) =>
  value
    .split(",")
    .filter((set) => /^\d+$/.test(set))
    .map(Number),
);

/** The weapon sets a hand holds an entry in, stored from 0: none outside the hands. */
const heldSets = z.array(z.number().int().min(0)).default([]);

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
        location: z.enum(LOCATION_OPTIONS),
        weaponSets: heldSetList,
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { entryId, location, weaponSets } = c.req.valid("query");
      return c.json(
        await CharacterInventoryService.getPlacement(
          c.var.requestSession,
          characterId,
          entryId ?? null,
          location,
          weaponSets,
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
        location: z.enum(LOCATION_OPTIONS).nullable().default(null),
        totalCharges: z.number().int().min(0).nullable().default(null),
        remainingCharges: z.number().int().min(0).nullable().default(null),
        weaponSets: heldSets,
        force: z.boolean().default(false),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { itemId, quantity, equipped, location, totalCharges, remainingCharges, weaponSets, force } =
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
          weaponSets,
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
        location: z.enum(LOCATION_OPTIONS).nullable().default(null),
        totalCharges: z.number().int().min(0).nullable().default(null),
        remainingCharges: z.number().int().min(0).nullable().default(null),
        weaponSets: heldSets,
        force: z.boolean().default(false),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { characterId, entryId } = c.req.valid("param");
      const { quantity, equipped, location, totalCharges, remainingCharges, weaponSets, force, updatedAt } =
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
          weaponSets,
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
