import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import {
  characterIdParam,
  groupIndexes,
  groupIndexList,
  itemCharges,
  itemQuantity,
} from "@/server/routers/api/validation.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";

/** What an entry's add and its update say of how many are carried, where, with what charges. */
const entryBody = z.object({
  quantity: itemQuantity,
  location: z.string().nullable().default(null),
  totalCharges: itemCharges,
  remainingCharges: itemCharges,
  groups: groupIndexes,
  force: z.boolean().default(false),
});

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
        location: z.string(),
        groups: groupIndexList,
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { entryId, location, groups } = c.req.valid("query");
      return c.json(
        await CharacterInventoryService.getPlacement(
          c.var.requestSession,
          characterId,
          entryId ?? null,
          location,
          groups,
        ),
        200,
      );
    },
  )
  .post(
    "/:characterId",
    validate("param", characterIdParam),
    validate("json", entryBody.extend({ itemId: z.string().uuid() })),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { itemId, quantity, location, totalCharges, remainingCharges, groups, force } = c.req.valid("json");
      return c.json(
        await CharacterInventoryService.addItem(
          c.var.requestSession,
          characterId,
          itemId,
          quantity,
          location,
          totalCharges,
          remainingCharges,
          groups,
          force,
        ),
        201,
      );
    },
  )
  .put(
    "/:characterId/:entryId",
    validate("param", entryParams),
    validate("json", entryBody.extend({ updatedAt: z.string().optional() })),
    async (c) => {
      const { characterId, entryId } = c.req.valid("param");
      const { quantity, location, totalCharges, remainingCharges, groups, force, updatedAt } = c.req.valid("json");
      return c.json(
        await CharacterInventoryService.updateItem(
          c.var.requestSession,
          characterId,
          entryId,
          quantity,
          location,
          totalCharges,
          remainingCharges,
          groups,
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
