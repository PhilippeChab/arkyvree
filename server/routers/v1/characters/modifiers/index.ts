import { Hono } from "hono";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Modifiers } from "@/server/routers/v1/schemas/characters.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";

/** A character's own modifiers. */
export default new Hono<ApiKeyContext>().get(
  "/:id/modifiers",
  describeRoute({ response: v1Modifiers, status: 200, summary: "A character's own modifiers" }),
  validate("param", idParam),
  async (c) => {
    const { id } = c.req.valid("param");
    return c.json(V1.modifiers(await CharacterModifiersService.getModifiers(c.var.requestSession, id)), 200);
  },
);
