import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam, orderDirDesc } from "@/server/routers/api/validation.ts";
import { v1Campaign, v1CampaignPage } from "@/server/routers/v1/schemas/campaigns.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { CampaignsService } from "@/server/services/campaigns/index.ts";

import characters from "./characters/index.ts";
import invites from "./invites/index.ts";
import players from "./players/index.ts";

/**
 * The campaigns the key's user plays in or runs: a page of them, one, its creation, its edit, its archive and its
 * deletion, and its characters, players and invites. A write answers the campaign as its read does.
 */
export default new Hono<ApiKeyContext>()
  .route("/", characters)
  .route("/", invites)
  .route("/", players)
  .get(
    "/",
    describeRoute({
      response: v1CampaignPage,
      status: 200,
      summary: "The campaigns the key's user plays in or runs, a page at a time",
    }),
    validate(
      "query",
      z.object({
        ...PAGE_FILTERS,
        orderBy: z.enum(["name", "createdAt", "updatedAt"]).default("createdAt"),
        orderDir: orderDirDesc,
        search: z.string().optional().meta({ description: "A part of the name or the description" }),
        visibility: z
          .enum(["active", "archived", "all"])
          .default("active")
          .meta({ description: "Its active campaigns, its archived ones, or both" }),
      }),
    ),
    async (c) => {
      const { limit, orderBy, orderDir, page, search, visibility } = c.req.valid("query");
      const campaigns = await CampaignsService.getCampaigns(
        c.var.requestSession,
        { orderBy, orderDir, search, visibility },
        { limit, page },
      );
      return c.json(V1.page(campaigns, V1.campaignSummary), 200);
    },
  )
  .get(
    "/:id",
    describeRoute({ response: v1Campaign, status: 200, summary: "A campaign, and the key's user's role in it" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.campaign(await CampaignsService.getCampaign(c.var.requestSession, id)), 200);
    },
  )
  .post(
    "/",
    describeRoute({
      response: v1Campaign,
      status: 201,
      summary: "Creates a campaign on a ruleset, the key's user its Game Master",
    }),
    validate(
      "json",
      z.object({
        description: z.string().optional(),
        name: z.string().min(1).max(255),
        rulesetId: z.string().uuid().meta({ description: "The ruleset its characters are built on" }),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      const { campaign } = await CampaignsService.createCampaign(c.var.requestSession, body);
      return c.json(V1.campaign(await CampaignsService.getCampaign(c.var.requestSession, campaign.id)), 201);
    },
  )
  .post(
    "/:id/unarchive",
    describeRoute({ response: v1Campaign, status: 200, summary: "Restores an archived campaign, as its Game Master" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await CampaignsService.unarchiveCampaign(c.var.requestSession, id);
      return c.json(V1.campaign(await CampaignsService.getCampaign(c.var.requestSession, id)), 200);
    },
  )
  .put(
    "/:id",
    describeRoute({
      response: v1Campaign,
      status: 200,
      summary: "Edits a campaign's name or description, as its Game Master",
    }),
    validate("param", idParam),
    validate("json", z.object({ description: z.string().optional(), name: z.string().min(1).max(255).optional() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      await CampaignsService.updateCampaign(c.var.requestSession, id, body);
      return c.json(V1.campaign(await CampaignsService.getCampaign(c.var.requestSession, id)), 200);
    },
  )
  .delete(
    "/:id",
    describeRoute({
      response: null,
      status: 204,
      summary:
        "Archives a campaign, as its Game Master: its players, invites and characters stay, and it's restored whole",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await CampaignsService.archiveCampaign(c.var.requestSession, id);
      return c.body(null, 204);
    },
  )
  .delete(
    "/:id/permanent",
    describeRoute({
      response: null,
      status: 204,
      summary: "Deletes an archived campaign for good, as its Game Master, with its players, invites and links",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await CampaignsService.hardDeleteCampaign(c.var.requestSession, id);
      return c.body(null, 204);
    },
  );
