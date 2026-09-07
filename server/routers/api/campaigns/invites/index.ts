import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { CampaignInvitesService } from "@/server/services/campaigns/index.ts";
import { limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

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
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/invites/me",
    async (c) => {
      const campaignInvitesService = CampaignInvitesService.initialize();
      const result = await campaignInvitesService.call(
        "getUserInvites",
        c.var.requestSession.userId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/invites/:inviteId",
    zValidator("param", z.object({ inviteId: z.string().uuid() })),
    async (c) => {
      const { inviteId } = c.req.valid("param");
      const campaignInvitesService = CampaignInvitesService.initialize();
      const result = await campaignInvitesService.call(
        "getCampaignInvite",
        c.var.requestSession,
        inviteId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/invites/:inviteId/accept",
    zValidator("param", z.object({ inviteId: z.string().uuid() })),
    async (c) => {
      const { inviteId } = c.req.valid("param");
      const campaignInvitesService = CampaignInvitesService.initialize();
      const result = await campaignInvitesService.call(
        "acceptCampaignInvite",
        c.var.requestSession,
        inviteId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/invites/:inviteId/reject",
    zValidator("param", z.object({ inviteId: z.string().uuid() })),
    async (c) => {
      const { inviteId } = c.req.valid("param");
      const campaignInvitesService = CampaignInvitesService.initialize();
      const result = await campaignInvitesService.call(
        "rejectCampaignInvite",
        c.var.requestSession,
        inviteId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/invites/:inviteId/revoke",
    zValidator("param", z.object({ inviteId: z.string().uuid() })),
    async (c) => {
      const { inviteId } = c.req.valid("param");
      const campaignInvitesService = CampaignInvitesService.initialize();

      const result = await campaignInvitesService.call(
        "revokeCampaignInvite",
        c.var.requestSession,
        inviteId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
