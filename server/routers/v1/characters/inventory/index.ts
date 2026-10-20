import { Hono } from "hono";
import { z } from "zod";

import { location } from "@/drizzle/schema.ts";
import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Inventory, v1InventoryEntry, v1Placement } from "@/server/routers/v1/schemas/characterParts.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";

/** An inventory entry's charges: those it has left, out of those it came with. */
const charges = z
  .object({ remaining: z.number().int().min(0).nullable(), total: z.number().int().min(0).nullable() })
  .nullable()
  .default(null)
  .meta({ description: "Its charges, for an item that has them" });

/** Where an entry is carried: its place, and the weapon sets a hand holds it in, stored from 0. */
const placement = {
  location: z
    .enum(location.enumValues)
    .nullable()
    .default(null)
    .meta({ description: "Where it's worn or held: `Two Handed`, `Torso`, `Finger`…; none, carried" }),
  weaponSets: z
    .array(z.number().int().min(0))
    .default([])
    .meta({ description: "The weapon sets a hand holds it in, from 0: none outside the hands" }),
};

/** An inventory entry, its add's and its update's. */
const entryBody = z.object({
  ...placement,
  charges,
  equipped: z.boolean().default(false),
  force: z
    .boolean()
    .default(false)
    .meta({ description: "Equip it even when the character doesn't meet its requirements (a proficiency it lacks)" }),
  quantity: z.number().int().min(1),
});

const entryParams = idParam.extend({ entryId: z.string().uuid() });

/** A character's inventory: what it carries, where, and how many. */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/inventory",
    describeRoute({ response: v1Inventory, status: 200, summary: "A character's inventory" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(
        (await CharacterInventoryService.getInventory(c.var.requestSession, id)).map(V1.inventoryEntry),
        200,
      );
    },
  )
  .get(
    "/:id/inventory/placement",
    describeRoute({
      response: v1Placement,
      status: 200,
      summary:
        "Why a place can't take one more of a character's items, if it can't: what an add without `force` refuses",
    }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        entryId: z.string().uuid().optional().meta({ description: "The entry placed, none for a new one" }),
        location: z.enum(location.enumValues),
        weaponSets: z
          .string()
          .default("")
          .transform((value) =>
            value
              .split(",")
              .filter((set) => /^\d+$/.test(set))
              .map(Number),
          )
          .meta({ description: "Comma-separated: the weapon sets a hand holds it in, from 0" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { entryId, location, weaponSets } = c.req.valid("query");
      const session = c.var.requestSession;
      const placement = await CharacterInventoryService.getPlacement(
        session,
        id,
        entryId ?? null,
        location,
        weaponSets,
      );
      return c.json(V1.placement(placement), 200);
    },
  )
  .post(
    "/:id/inventory",
    describeRoute({ response: v1InventoryEntry, status: 201, summary: "Adds an item to a character's inventory" }),
    validate("param", idParam),
    validate("json", entryBody.extend({ itemId: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const session = c.var.requestSession;
      const entry = V1.inventoryRequest(body);
      const created = await CharacterInventoryService.addItem(
        session,
        id,
        entry.itemId,
        entry.quantity,
        entry.equipped,
        entry.location,
        entry.totalCharges,
        entry.remainingCharges,
        entry.weaponSets,
        entry.force,
      );
      const inventory = await CharacterInventoryService.getInventory(session, id);
      return c.json(V1.inventoryEntryOf(inventory, created.id), 201);
    },
  )
  .put(
    "/:id/inventory/:entryId",
    describeRoute({ response: v1InventoryEntry, status: 200, summary: "Changes an item a character carries" }),
    validate("param", entryParams),
    validate("json", entryBody),
    async (c) => {
      const { entryId, id } = c.req.valid("param");
      const body = c.req.valid("json");
      const session = c.var.requestSession;
      const entry = V1.inventoryRequest(body);
      await CharacterInventoryService.updateItem(
        session,
        id,
        entryId,
        entry.quantity,
        entry.equipped,
        entry.location,
        entry.totalCharges,
        entry.remainingCharges,
        entry.weaponSets,
        entry.force,
      );
      const inventory = await CharacterInventoryService.getInventory(session, id);
      return c.json(V1.inventoryEntryOf(inventory, entryId), 200);
    },
  )
  .delete(
    "/:id/inventory/:entryId",
    describeRoute({ response: null, status: 204, summary: "Removes an item from a character's inventory" }),
    validate("param", entryParams),
    async (c) => {
      const { entryId, id } = c.req.valid("param");
      await CharacterInventoryService.removeItem(c.var.requestSession, id, entryId);
      return c.body(null, 204);
    },
  );
