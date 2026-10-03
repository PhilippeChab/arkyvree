import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { idParam, limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { CampaignInvitesService } from "@/server/services/campaigns/invites/index.ts";

export default new Hono<SessionContext>()
  .get("/invites/me", async (c) => {
    return c.json(await CampaignInvitesService.getUserInvites(c.var.requestSession.userId), 200);
  })
  .get("/invites/:inviteId", zValidator("param", z.object({ inviteId: z.string().uuid() })), async (c) => {
    const { inviteId } = c.req.valid("param");
    return c.json(await CampaignInvitesService.getCampaignInvite(c.var.requestSession, inviteId), 200);
  })
  .get(
    "/:id/invites",
    zValidator("param", idParam),
    zValidator(
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
        await CampaignInvitesService.getCampaignInvites(
          c.var.requestSession,
          id,
          { search, orderBy, orderDir },
          { limit, page },
        ),
        200,
      );
    },
  )
  .post("/invites/:inviteId/accept", zValidator("param", z.object({ inviteId: z.string().uuid() })), async (c) => {
    const { inviteId } = c.req.valid("param");
    return c.json(await CampaignInvitesService.acceptCampaignInvite(c.var.requestSession, inviteId), 200);
  })
  .post("/invites/:inviteId/reject", zValidator("param", z.object({ inviteId: z.string().uuid() })), async (c) => {
    const { inviteId } = c.req.valid("param");
    return c.json(await CampaignInvitesService.rejectCampaignInvite(c.var.requestSession, inviteId), 200);
  })
  .post("/invites/:inviteId/revoke", zValidator("param", z.object({ inviteId: z.string().uuid() })), async (c) => {
    const { inviteId } = c.req.valid("param");

    return c.json(await CampaignInvitesService.revokeCampaignInvite(c.var.requestSession, inviteId), 200);
  });
