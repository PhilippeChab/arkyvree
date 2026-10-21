import { Hono } from "hono";
import { z } from "zod";

import { role as campaignRole } from "@/drizzle/schema.ts";
import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam, orderDirAsc, sanitizedEmail } from "@/server/routers/api/validation.ts";
import { v1CampaignPlayerPage, v1PlayerSlot } from "@/server/routers/v1/schemas/campaigns.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { CampaignPlayersService } from "@/server/services/campaigns/players/index.ts";

/** A player slot as its add and its change take it: its role, and an address to invite into it. */
const playerBody = z.object({
  email: sanitizedEmail
    .optional()
    .meta({ description: "An address to invite into the slot: its user, or whoever signs up with it" }),
  role: z.enum(campaignRole.enumValues),
});

const playerParams = idParam.extend({ playerId: z.string().uuid() });

/** A campaign's player slots: a page of them, and a slot's add, change and removal, as the Game Master. */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/players",
    describeRoute({
      response: v1CampaignPlayerPage,
      status: 200,
      summary: "A campaign's player slots, a page at a time: each one's role, its user, and its pending invite",
    }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        ...PAGE_FILTERS,
        orderBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
        orderDir: orderDirAsc,
        search: z
          .string()
          .optional()
          .meta({ description: "A part of the user's name, or of their address for the Game Master" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, orderBy, orderDir, page, search } = c.req.valid("query");
      const players = await CampaignPlayersService.getPlayers(
        c.var.requestSession,
        id,
        { orderBy, orderDir, search },
        { limit, page },
      );
      return c.json(V1.page(players, V1.campaignPlayer), 200);
    },
  )
  .post(
    "/:id/players",
    describeRoute({
      response: v1PlayerSlot,
      status: 201,
      summary: "Adds a player slot to a campaign, as its Game Master, and invites `email` into it when it's given",
    }),
    validate("param", idParam),
    validate("json", playerBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const { email, role } = c.req.valid("json");
      return c.json(V1.playerSlot(await CampaignPlayersService.addPlayer(c.var.requestSession, id, role, email)), 201);
    },
  )
  .put(
    "/:id/players/:playerId",
    describeRoute({
      response: v1PlayerSlot,
      status: 200,
      summary:
        "Changes a player slot's role, as the campaign's Game Master, and invites `email` into it when it's given " +
        "and the slot is open",
    }),
    validate("param", playerParams),
    validate("json", playerBody),
    async (c) => {
      const { id, playerId } = c.req.valid("param");
      const { email, role } = c.req.valid("json");
      const slot = await CampaignPlayersService.updatePlayer(c.var.requestSession, id, playerId, role, email);
      return c.json(V1.playerSlot(slot), 200);
    },
  )
  .delete(
    "/:id/players/:playerId",
    describeRoute({
      response: null,
      status: 204,
      summary:
        "Removes a player slot, with its invites and its characters' links: the Game Master any, a player their own",
    }),
    validate("param", playerParams),
    async (c) => {
      const { id, playerId } = c.req.valid("param");
      await CampaignPlayersService.removePlayer(c.var.requestSession, id, playerId);
      return c.body(null, 204);
    },
  );
