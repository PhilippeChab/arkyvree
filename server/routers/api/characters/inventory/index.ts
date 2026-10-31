import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { characterIdParam } from "@/server/routers/api/validation.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";

const entryParams = characterIdParam.extend({ entryId: z.string().uuid() });

/** The groups an entry is held in, stored from 0 (3.5's weapon sets a hand holds it in): none outside them. */
const groupIndexes = z.array(z.number().int().min(0)).default([]);

/** Comma-separated groups (3.5's weapon sets), stored from 0: what isn't one is dropped (an empty string is none). */
const groupIndexList = z.string().transform((value) =>
  value
    .split(",")
    .filter((set) => /^\d+$/.test(set))
    .map(Number),
);

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
    validate(
      "json",
      z.object({
        itemId: z.string().uuid(),
        quantity: z.number().int().min(1),
        location: z.string().nullable().default(null),
        totalCharges: z.number().int().min(0).nullable().default(null),
        remainingCharges: z.number().int().min(0).nullable().default(null),
        groups: groupIndexes,
        force: z.boolean().default(false),
      }),
    ),
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
    validate(
      "json",
      z.object({
        quantity: z.number().int().min(1),
        location: z.string().nullable().default(null),
        totalCharges: z.number().int().min(0).nullable().default(null),
        remainingCharges: z.number().int().min(0).nullable().default(null),
        groups: groupIndexes,
        force: z.boolean().default(false),
        updatedAt: z.string().optional(),
      }),
    ),
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
