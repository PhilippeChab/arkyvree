import { Hono } from "hono";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import {
  v1InviteStatus,
  v1ReceivedRulesetInvite,
  v1ReceivedRulesetInvites,
} from "@/server/routers/v1/schemas/invites.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { ContributorsService } from "@/server/services/rulesets/contributors/index.ts";

/**
 * The invites to the key's user to contribute to a ruleset (theirs alone, anyone else's a 404), and their answer. An
 * invite's id is its contributor's.
 */
export default new Hono<ApiKeyContext>()
  .get(
    "/",
    describeRoute({
      response: v1ReceivedRulesetInvites,
      status: 200,
      summary: "The pending invites to the key's user to contribute to a ruleset, ten at most",
    }),
    async (c) => {
      const invites = await ContributorsService.getUserInvites(c.var.requestSession.userId);
      return c.json(invites.map(V1.receivedRulesetInvite), 200);
    },
  )
  .get(
    "/:id",
    describeRoute({
      response: v1ReceivedRulesetInvite,
      status: 200,
      summary: "An invite to the key's user to contribute to a ruleset, any status",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.receivedRulesetInvite(await ContributorsService.getInvite(c.var.requestSession, id)), 200);
    },
  )
  .post(
    "/:id/accept",
    describeRoute({
      response: v1InviteStatus,
      status: 200,
      summary: "Accepts a pending invite to the key's user: they contribute to the ruleset in its role from then on",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.inviteStatus(await ContributorsService.acceptInvite(c.var.requestSession, id)), 200);
    },
  )
  .post(
    "/:id/reject",
    describeRoute({ response: v1InviteStatus, status: 200, summary: "Rejects a pending invite to the key's user" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.inviteStatus(await ContributorsService.rejectInvite(c.var.requestSession, id)), 200);
    },
  );
