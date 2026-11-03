import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam, orderDirDesc } from "@/server/routers/api/validation.ts";
import { v1CampaignInvitePage } from "@/server/routers/v1/schemas/campaigns.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { CampaignInvitesService } from "@/server/services/campaigns/invites/index.ts";

/** The invites sent for a campaign's player slots, which its members read. */
export default new Hono<ApiKeyContext>().get(
  "/:id/invites",
  describeRoute({
    response: v1CampaignInvitePage,
    status: 200,
    summary: "The invites sent for a campaign's player slots, a page at a time, any status",
  }),
  validate("param", idParam),
  validate(
    "query",
    z.object({
      ...PAGE_FILTERS,
      orderBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
      orderDir: orderDirDesc,
      search: z
        .string()
        .optional()
        .meta({ description: "A part of the invited user's name, or of the address for the Game Master" }),
    }),
  ),
  async (c) => {
    const { id } = c.req.valid("param");
    const { limit, orderBy, orderDir, page, search } = c.req.valid("query");
    const invites = await CampaignInvitesService.getInvites(
      c.var.requestSession,
      id,
      { orderBy, orderDir, search },
      { limit, page },
    );
    return c.json(V1.page(invites, V1.campaignInvite), 200);
  },
);
