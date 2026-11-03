import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { groupIndexes, groupIndexList, idParam, itemCharges, itemQuantity } from "@/server/routers/api/validation.ts";
import { v1Inventory, v1InventoryEntry, v1Placement } from "@/server/routers/v1/schemas/characters.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";

/** What an entry's body says of where and how it's carried, its add's and its update's. */
const entryFields = {
  force: z.boolean().default(false).meta({
    description: "Saves it though the character doesn't meet its requirements",
  }),
  groups: groupIndexes.meta({
    description: "The groups it's held in, from 0, as its rules place it",
  }),
  location: z
    .string()
    .nullable()
    .default(null)
    .meta({ description: "Where it's placed, as its rules name the place: none for carried" }),
  quantity: itemQuantity,
  remainingCharges: itemCharges,
  totalCharges: itemCharges,
};

const entryParams = idParam.extend({ entryId: z.string().uuid() });

/** A character's inventory. */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/inventory",
    describeRoute({ response: v1Inventory, status: 200, summary: "A character's inventory" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.inventory(await CharacterInventoryService.getInventory(c.var.requestSession, id)), 200);
    },
  )
  .get(
    "/:id/inventory/placement",
    describeRoute({
      response: v1Placement,
      status: 200,
      summary: "Why a place can't take one more of a character's items, as its rules say, none when it can",
    }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        entryId: z.string().uuid().optional().meta({ description: "The entry it moves, none for a new one" }),
        groups: groupIndexList.meta({
          description: "The groups it's held in, comma-separated, from 0, as its rules place it",
        }),
        location: z.string(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { entryId, groups, location } = c.req.valid("query");
      const placement = await CharacterInventoryService.getPlacement(
        c.var.requestSession,
        id,
        entryId ?? null,
        location,
        groups,
      );
      return c.json(V1.placement(placement), 200);
    },
  )
  .post(
    "/:id/inventory",
    describeRoute({ response: v1InventoryEntry, status: 201, summary: "Adds an item to a character's inventory" }),
    validate("param", idParam),
    validate("json", z.object({ ...entryFields, itemId: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { force, groups, itemId, location, quantity, remainingCharges, totalCharges } = c.req.valid("json");
      const added = await CharacterInventoryService.addItem(
        c.var.requestSession,
        id,
        itemId,
        quantity,
        location,
        totalCharges,
        remainingCharges,
        groups,
        force,
      );
      const entry = await CharacterInventoryService.getEntry(c.var.requestSession, id, added.id);
      return c.json(V1.inventoryEntry(entry), 201);
    },
  )
  .put(
    "/:id/inventory/:entryId",
    describeRoute({ response: v1InventoryEntry, status: 200, summary: "Updates an item a character carries" }),
    validate("param", entryParams),
    validate(
      "json",
      z.object({
        ...entryFields,
        updatedAt: z.string().optional().meta({ description: "When it was read: refused if it changed since (409)" }),
      }),
    ),
    async (c) => {
      const { entryId, id } = c.req.valid("param");
      const { force, groups, location, quantity, remainingCharges, totalCharges, updatedAt } = c.req.valid("json");
      await CharacterInventoryService.updateItem(
        c.var.requestSession,
        id,
        entryId,
        quantity,
        location,
        totalCharges,
        remainingCharges,
        groups,
        force,
        updatedAt,
      );
      const entry = await CharacterInventoryService.getEntry(c.var.requestSession, id, entryId);
      return c.json(V1.inventoryEntry(entry), 200);
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
