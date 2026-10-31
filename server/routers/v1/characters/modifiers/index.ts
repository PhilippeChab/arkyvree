import { Hono } from "hono";
import { z } from "zod";

import { NotFoundError } from "@/server/errors/index.ts";
import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Modifier, v1Modifiers } from "@/server/routers/v1/schemas/characters.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { modifierFields } from "@/server/routers/v1/validation.ts";
import { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";
import type { Session } from "@/shared/relations.ts";

const modifierParams = idParam.extend({ modifierId: z.string().uuid() });

/** A character's own modifier, with its target's labels. */
async function readModifier(session: Session, characterId: string, modifierId: string) {
  const modifiers = V1.modifiers(await CharacterModifiersService.getModifiers(session, characterId));
  const modifier = modifiers.find(({ id }) => id === modifierId);
  if (!modifier) throw new NotFoundError("Modifier not found");
  return modifier;
}

/** A character's own modifiers. */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/modifiers",
    describeRoute({ response: v1Modifiers, status: 200, summary: "A character's own modifiers" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.modifiers(await CharacterModifiersService.getModifiers(c.var.requestSession, id)), 200);
    },
  )
  .post(
    "/:id/modifiers",
    describeRoute({ response: v1Modifier, status: 201, summary: "Adds a modifier of a character's own" }),
    validate("param", idParam),
    validate("json", z.object(modifierFields)),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await CharacterModifiersService.createModifier(c.var.requestSession, id, body);
      return c.json(await readModifier(c.var.requestSession, id, created.id), 201);
    },
  )
  .put(
    "/:id/modifiers/:modifierId",
    describeRoute({ response: v1Modifier, status: 200, summary: "Updates a modifier of a character's own" }),
    validate("param", modifierParams),
    validate(
      "json",
      z.object({
        ...modifierFields,
        updatedAt: z.string().optional().meta({ description: "When it was read: refused if it changed since (409)" }),
      }),
    ),
    async (c) => {
      const { id, modifierId } = c.req.valid("param");
      const body = c.req.valid("json");
      await CharacterModifiersService.updateModifier(c.var.requestSession, id, modifierId, body);
      return c.json(await readModifier(c.var.requestSession, id, modifierId), 200);
    },
  )
  .delete(
    "/:id/modifiers/:modifierId",
    describeRoute({ response: null, status: 204, summary: "Removes a modifier of a character's own" }),
    validate("param", modifierParams),
    async (c) => {
      const { id, modifierId } = c.req.valid("param");
      await CharacterModifiersService.deleteModifier(c.var.requestSession, id, modifierId);
      return c.body(null, 204);
    },
  );
