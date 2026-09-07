import { toJson } from "@/server/errors/index.ts";
import { denyDemoUser, type SessionContext } from "@/server/middlewares/index.ts";
import { CampaignPlayersService } from "@/server/services/campaigns/index.ts";
import { limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { sanitizeEmail } from "@/shared/utils.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:id/players",
    zValidator("param", z.object({ id: z.string().uuid() })),
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

      const campaignPlayersService = CampaignPlayersService.initialize();
      const result = await campaignPlayersService.call(
        "getCampaignPlayers",
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
  .post(
    "/:id/players",
    denyDemoUser,
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        role: z.enum(["Game Master", "Player Character"]),
        email: z.string().email().transform(sanitizeEmail).optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { role, email } = c.req.valid("json");
      const campaignPlayersService = CampaignPlayersService.initialize();
      const result = await campaignPlayersService.call(
        "addCampaignPlayer",
        c.var.requestSession,
        id,
        role,
        email,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .put(
    "/:id/players/:playerId",
    zValidator("param", z.object({ id: z.string().uuid(), playerId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        role: z.enum(["Game Master", "Player Character"]),
        email: z.string().email().transform(sanitizeEmail).optional(),
      }),
    ),
    async (c) => {
      const { id, playerId } = c.req.valid("param");
      const { role, email } = c.req.valid("json");
      const campaignPlayersService = CampaignPlayersService.initialize();
      const result = await campaignPlayersService.call(
        "updateCampaignPlayer",
        c.var.requestSession,
        id,
        playerId,
        role,
        email,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .delete(
    "/:id/players/:playerId",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        playerId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id, playerId } = c.req.valid("param");
      const campaignPlayersService = CampaignPlayersService.initialize();
      const result = await campaignPlayersService.call(
        "removeCampaignPlayer",
        c.var.requestSession,
        id,
        playerId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
