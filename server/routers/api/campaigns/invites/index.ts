import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { idParam, limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { CampaignInvitesService } from "@/server/services/campaigns/invites/index.ts";

const inviteIdParam = z.object({ inviteId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get("/invites/me", async (c) =>
    c.json(await CampaignInvitesService.getUserInvites(c.var.requestSession.userId), 200),
  )
  .get("/invites/:inviteId", validate("param", inviteIdParam), async (c) => {
    const { inviteId } = c.req.valid("param");
    return c.json(await CampaignInvitesService.getInvite(c.var.requestSession, inviteId), 200);
  })
  .get(
    "/:id/invites",
    validate("param", idParam),
    validate(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        orderBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
        orderDir: orderDirDesc,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, orderBy, orderDir } = c.req.valid("query");
      return c.json(
        await CampaignInvitesService.getInvites(
          c.var.requestSession,
          id,
          { search, orderBy, orderDir },
          { limit, page },
        ),
        200,
      );
    },
  )
  .post("/invites/:inviteId/accept", validate("param", inviteIdParam), async (c) => {
    const { inviteId } = c.req.valid("param");
    return c.json(await CampaignInvitesService.acceptInvite(c.var.requestSession, inviteId), 200);
  })
  .post("/invites/:inviteId/reject", validate("param", inviteIdParam), async (c) => {
    const { inviteId } = c.req.valid("param");
    return c.json(await CampaignInvitesService.rejectInvite(c.var.requestSession, inviteId), 200);
  })
  .post("/invites/:inviteId/revoke", validate("param", inviteIdParam), async (c) => {
    const { inviteId } = c.req.valid("param");

    return c.json(await CampaignInvitesService.revokeInvite(c.var.requestSession, inviteId), 200);
  });
