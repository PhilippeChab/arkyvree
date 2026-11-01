import { Hono } from "hono";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1InviteStatus, v1ReceivedCampaignInvite } from "@/server/routers/v1/schemas/invites.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CampaignInvitesService } from "@/server/services/campaigns/invites/index.ts";

/**
 * An invite to play in a campaign: the key's user's own (theirs alone, anyone else's a 404), their answer, and the
 * Game Master's revoke of one their campaign sent.
 */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id",
    describeRoute({
      response: v1ReceivedCampaignInvite,
      status: 200,
      summary: "An invite to the key's user to play in a campaign, any status",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.receivedCampaignInvite(await CampaignInvitesService.getInvite(c.var.requestSession, id)), 200);
    },
  )
  .post(
    "/:id/accept",
    describeRoute({
      response: v1InviteStatus,
      status: 200,
      summary: "Accepts a pending invite to the key's user: they take its player slot",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.inviteStatus(await CampaignInvitesService.acceptInvite(c.var.requestSession, id)), 200);
    },
  )
  .post(
    "/:id/reject",
    describeRoute({ response: v1InviteStatus, status: 200, summary: "Rejects a pending invite to the key's user" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.inviteStatus(await CampaignInvitesService.rejectInvite(c.var.requestSession, id)), 200);
    },
  )
  .post(
    "/:id/revoke",
    describeRoute({
      response: v1InviteStatus,
      status: 200,
      summary: "Takes back a pending invite the key's user's campaign sent, as its Game Master",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.inviteStatus(await CampaignInvitesService.revokeInvite(c.var.requestSession, id)), 200);
    },
  );
