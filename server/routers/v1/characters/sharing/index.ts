import { Hono } from "hono";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1ShareLink } from "@/server/routers/v1/schemas/sharing.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CharacterSharingService } from "@/server/services/characters/sharing/index.ts";

/** A player character's share link, which its owner makes and revokes: anyone with its token reads the character. */
export default new Hono<ApiKeyContext>()
  .post(
    "/:id/share",
    describeRoute({
      response: v1ShareLink,
      status: 200,
      summary: "Makes a character's share link, as its owner: a new token, which replaces the one before",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.shareLink(await CharacterSharingService.generateShareToken(c.var.requestSession, id)), 200);
    },
  )
  .delete(
    "/:id/share",
    describeRoute({
      response: v1ShareLink,
      status: 200,
      summary: "Revokes a character's share link, as its owner: its token reads nothing from then on",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.shareLink(await CharacterSharingService.revokeShareToken(c.var.requestSession, id)), 200);
    },
  );
