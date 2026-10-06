import { Hono } from "hono";
import { z } from "zod";

import { validate } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { modifierOperator } from "@/server/routers/api/rulesets/customization/validation.ts";
import { characterIdParam } from "@/server/routers/api/validation.ts";
import { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";

const modifierParams = characterIdParam.extend({ modifierId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get("/:characterId/modifiers", validate("param", characterIdParam), async (c) => {
    const { characterId } = c.req.valid("param");
    return c.json(await CharacterModifiersService.getModifiers(c.var.requestSession, characterId), 200);
  })
  .post(
    "/:characterId/modifiers",
    validate("param", characterIdParam),
    validate(
      "json",
      z.object({
        target: z.string().min(1),
        value: z.string().min(1),
        operator: modifierOperator,
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await CharacterModifiersService.createModifier(c.var.requestSession, characterId, body), 201);
    },
  )
  .put(
    "/:characterId/modifiers/:modifierId",
    validate("param", modifierParams),
    validate(
      "json",
      z.object({
        target: z.string().min(1),
        value: z.string().min(1),
        operator: modifierOperator,
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { characterId, modifierId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await CharacterModifiersService.updateModifier(c.var.requestSession, characterId, modifierId, body),
        200,
      );
    },
  )
  .delete("/:characterId/modifiers/:modifierId", validate("param", modifierParams), async (c) => {
    const { characterId, modifierId } = c.req.valid("param");
    return c.json(await CharacterModifiersService.deleteModifier(c.var.requestSession, characterId, modifierId), 200);
  });
