import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1CharacterModifiers } from "@/server/routers/v1/schemas/characterParts.ts";
import { v1Modifier } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";
import { MODIFIER_OPERATORS } from "@/shared/customization/operators.ts";

/** A character's own modifier, its create's and its update's. */
const modifierBody = z.object({
  operator: z.enum(MODIFIER_OPERATORS),
  target: z.string().min(1).meta({ description: "The path it changes (`GET /v1/rulesets/{id}/target-paths`)" }),
  value: z.string().min(1).meta({ description: "A number, a text or a flag, as its target takes, or a template" }),
});

const modifierParams = idParam.extend({ modifierId: z.string().uuid() });

/** A character's own modifiers: what its owner changes of its sheet, past what its rules give it. */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/modifiers",
    describeRoute({
      response: v1CharacterModifiers,
      status: 200,
      summary: "A character's own modifiers, which its owner adds",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json((await CharacterModifiersService.getModifiers(c.var.requestSession, id)).map(V1.modifier), 200);
    },
  )
  .post(
    "/:id/modifiers",
    describeRoute({ response: v1Modifier, status: 201, summary: "Adds a modifier of its own to a character" }),
    validate("param", idParam),
    validate("json", modifierBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const session = c.var.requestSession;
      const created = await CharacterModifiersService.createModifier(session, id, body);
      return c.json(V1.modifierOf(await CharacterModifiersService.getModifiers(session, id), created.id), 201);
    },
  )
  .put(
    "/:id/modifiers/:modifierId",
    describeRoute({ response: v1Modifier, status: 200, summary: "Changes a modifier of a character's own" }),
    validate("param", modifierParams),
    validate("json", modifierBody),
    async (c) => {
      const { id, modifierId } = c.req.valid("param");
      const body = c.req.valid("json");
      const session = c.var.requestSession;
      await CharacterModifiersService.updateModifier(session, id, modifierId, body);
      return c.json(V1.modifierOf(await CharacterModifiersService.getModifiers(session, id), modifierId), 200);
    },
  )
  .delete(
    "/:id/modifiers/:modifierId",
    describeRoute({ response: null, status: 204, summary: "Deletes a modifier of a character's own" }),
    validate("param", modifierParams),
    async (c) => {
      const { id, modifierId } = c.req.valid("param");
      await CharacterModifiersService.deleteModifier(c.var.requestSession, id, modifierId);
      return c.body(null, 204);
    },
  );
