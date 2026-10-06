import { Hono } from "hono";
import { z } from "zod";

import { role as campaignRole } from "@/drizzle/schema.ts";
import { denyDemoUser, type SessionContext, zValidator } from "@/server/middlewares/index.ts";
import { idParam, limit, orderDirAsc, page, sanitizedEmail } from "@/server/routers/api/validation.ts";
import { CampaignPlayersService } from "@/server/services/campaigns/players/index.ts";

const playerParams = idParam.extend({ playerId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get(
    "/:id/players",
    zValidator("param", idParam),
    zValidator(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        orderBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
        orderDir: orderDirAsc,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, orderBy, orderDir } = c.req.valid("query");
      return c.json(
        await CampaignPlayersService.getPlayers(
          c.var.requestSession,
          id,
          { search, orderBy, orderDir },
          { limit, page },
        ),
        200,
      );
    },
  )
  .post(
    "/:id/players",
    denyDemoUser,
    zValidator("param", idParam),
    zValidator(
      "json",
      z.object({
        role: z.enum(campaignRole.enumValues),
        email: sanitizedEmail.optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { role, email } = c.req.valid("json");
      return c.json(await CampaignPlayersService.addPlayer(c.var.requestSession, id, role, email), 200);
    },
  )
  .put(
    "/:id/players/:playerId",
    zValidator("param", playerParams),
    zValidator(
      "json",
      z.object({
        role: z.enum(campaignRole.enumValues),
        email: sanitizedEmail.optional(),
      }),
    ),
    async (c) => {
      const { id, playerId } = c.req.valid("param");
      const { role, email } = c.req.valid("json");
      return c.json(await CampaignPlayersService.updatePlayer(c.var.requestSession, id, playerId, role, email), 200);
    },
  )
  .delete("/:id/players/:playerId", zValidator("param", playerParams), async (c) => {
    const { id, playerId } = c.req.valid("param");
    return c.json(await CampaignPlayersService.removePlayer(c.var.requestSession, id, playerId), 200);
  });
