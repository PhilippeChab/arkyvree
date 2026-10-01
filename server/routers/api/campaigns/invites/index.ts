import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { respond } from "@/server/routers/respond.ts";
import { CampaignInvitesService } from "@/server/services/campaigns/index.ts";

export default new Hono<SessionContext>()
  .get(
    "/:id/invites",
    zValidator("param", z.object({ id: z.string().uuid() })),
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

      const campaignInvitesService = CampaignInvitesService.initialize();
      const result = await campaignInvitesService.call(
        "getCampaignInvites",
        c.var.requestSession,
        id,
        { search, orderBy, orderDir },
        { limit, page },
      );
      return respond(c, result, 200);
    },
  )
  .get("/invites/me", async (c) => {
    const campaignInvitesService = CampaignInvitesService.initialize();
    const result = await campaignInvitesService.call("getUserInvites", c.var.requestSession.userId);
    return respond(c, result, 200);
  })
  .get("/invites/:inviteId", zValidator("param", z.object({ inviteId: z.string().uuid() })), async (c) => {
    const { inviteId } = c.req.valid("param");
    const campaignInvitesService = CampaignInvitesService.initialize();
    const result = await campaignInvitesService.call("getCampaignInvite", c.var.requestSession, inviteId);
    return respond(c, result, 200);
  })
  .post("/invites/:inviteId/accept", zValidator("param", z.object({ inviteId: z.string().uuid() })), async (c) => {
    const { inviteId } = c.req.valid("param");
    const campaignInvitesService = CampaignInvitesService.initialize();
    const result = await campaignInvitesService.call("acceptCampaignInvite", c.var.requestSession, inviteId);
    return respond(c, result, 200);
  })
  .post("/invites/:inviteId/reject", zValidator("param", z.object({ inviteId: z.string().uuid() })), async (c) => {
    const { inviteId } = c.req.valid("param");
    const campaignInvitesService = CampaignInvitesService.initialize();
    const result = await campaignInvitesService.call("rejectCampaignInvite", c.var.requestSession, inviteId);
    return respond(c, result, 200);
  })
  .post("/invites/:inviteId/revoke", zValidator("param", z.object({ inviteId: z.string().uuid() })), async (c) => {
    const { inviteId } = c.req.valid("param");
    const campaignInvitesService = CampaignInvitesService.initialize();

    const result = await campaignInvitesService.call("revokeCampaignInvite", c.var.requestSession, inviteId);
    return respond(c, result, 200);
  });
