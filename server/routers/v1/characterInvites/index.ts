import { Hono } from "hono";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1InviteStatus, v1ReceivedCharacterInvite } from "@/server/routers/v1/schemas/invites.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";

/**
 * The invites to the key's user to contribute to a character (theirs alone, anyone else's a 404), and their answer. An
 * invite's id is its contributor's.
 */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id",
    describeRoute({
      response: v1ReceivedCharacterInvite,
      status: 200,
      summary: "An invite to the key's user to contribute to a character, any status",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(
        V1.receivedCharacterInvite(await CharacterContributorsService.getInvite(c.var.requestSession, id)),
        200,
      );
    },
  )
  .post(
    "/:id/accept",
    describeRoute({
      response: v1InviteStatus,
      status: 200,
      summary: "Accepts a pending invite to the key's user: they edit the character from then on",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.inviteStatus(await CharacterContributorsService.acceptInvite(c.var.requestSession, id)), 200);
    },
  )
  .post(
    "/:id/reject",
    describeRoute({ response: v1InviteStatus, status: 200, summary: "Rejects a pending invite to the key's user" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.inviteStatus(await CharacterContributorsService.rejectInvite(c.var.requestSession, id)), 200);
    },
  );
