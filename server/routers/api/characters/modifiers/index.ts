import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { modifierOperator } from "@/server/routers/api/rulesets/customization/validation.ts";
import { characterIdParam } from "@/server/routers/api/validation.ts";
import { respond } from "@/server/routers/respond.ts";
import { CharacterModifiersService } from "@/server/services/characters/index.ts";

export default new Hono<SessionContext>()
  .get("/:characterId/modifiers", zValidator("param", characterIdParam), async (c) => {
    const { characterId } = c.req.valid("param");
    const result = await CharacterModifiersService.initialize().call("getModifiers", c.var.requestSession, characterId);
    return respond(c, result, 200);
  })
  .post(
    "/:characterId/modifiers",
    zValidator("param", characterIdParam),
    zValidator(
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
      const result = await CharacterModifiersService.initialize().call(
        "createModifier",
        c.var.requestSession,
        characterId,
        body,
      );
      return respond(c, result, 201);
    },
  )
  .put(
    "/:characterId/modifiers/:modifierId",
    zValidator("param", z.object({ characterId: z.string().uuid(), modifierId: z.string().uuid() })),
    zValidator(
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
      const result = await CharacterModifiersService.initialize().call(
        "updateModifier",
        c.var.requestSession,
        characterId,
        modifierId,
        body,
      );
      return respond(c, result, 200);
    },
  )
  .delete(
    "/:characterId/modifiers/:modifierId",
    zValidator("param", z.object({ characterId: z.string().uuid(), modifierId: z.string().uuid() })),
    async (c) => {
      const { characterId, modifierId } = c.req.valid("param");
      const result = await CharacterModifiersService.initialize().call(
        "deleteModifier",
        c.var.requestSession,
        characterId,
        modifierId,
      );
      return respond(c, result, 200);
    },
  );
