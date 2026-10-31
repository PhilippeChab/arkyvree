import { Hono } from "hono";
import { z } from "zod";

import { apiExportRateLimit, type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import {
  v1CampaignCharacter,
  v1CampaignCharacterLink,
  v1CampaignCharacterPage,
  v1CharacterVisibility,
  v1LinkableCharacterPage,
} from "@/server/routers/v1/schemas/campaigns.ts";
import { v1Export } from "@/server/routers/v1/schemas/exports.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";

const characterParams = idParam.extend({ characterId: z.string().uuid() });

/**
 * A campaign's characters, as the key's user may see each: a page of them, one, the user's own they could link, a link
 * and its visibility's change, and a linked character's PDF, queued as an export.
 */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/characters",
    describeRoute({
      response: v1CampaignCharacterPage,
      status: 200,
      summary:
        "The characters a campaign's players link to it, a page at a time: those the key's user may see, a `Partial` " +
        "one by its identity alone",
    }),
    validate("param", idParam),
    validate(
      "query",
      z.object({ ...PAGE_FILTERS, search: z.string().optional().meta({ description: "A part of the name" }) }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search } = c.req.valid("query");
      const characters = await CampaignCharactersService.getCharacters(
        c.var.requestSession,
        id,
        { search },
        { limit, page },
      );
      return c.json(V1.page(characters, V1.campaignCharacterSummary), 200);
    },
  )
  .get(
    "/:id/characters/:characterId",
    describeRoute({
      response: v1CampaignCharacter,
      status: 200,
      summary: "A character linked to a campaign: its sheet, or its identity alone when the key's user sees no more",
    }),
    validate("param", characterParams),
    async (c) => {
      const { characterId, id } = c.req.valid("param");
      const character = await CampaignCharactersService.getCharacter(c.var.requestSession, id, characterId);
      return c.json(V1.campaignCharacter(character), 200);
    },
  )
  .get(
    "/:id/linkable-characters",
    describeRoute({
      response: v1LinkableCharacterPage,
      status: 200,
      summary:
        "The key's user's player characters a campaign could link, a page at a time: on its ruleset, in no campaign",
    }),
    validate("param", idParam),
    validate(
      "query",
      z.object({ ...PAGE_FILTERS, search: z.string().optional().meta({ description: "A part of the name" }) }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search } = c.req.valid("query");
      const characters = await CampaignCharactersService.getLinkableCharacters(
        c.var.requestSession,
        id,
        { search },
        { limit, page },
      );
      return c.json(V1.page(characters, V1.linkableCharacter), 200);
    },
  )
  .post(
    "/:id/characters",
    describeRoute({
      response: v1CampaignCharacterLink,
      status: 201,
      summary: "Links a player character of the key's user's to a campaign they play in, built on its ruleset",
    }),
    validate("param", idParam),
    validate(
      "json",
      z.object({ characterId: z.string().uuid(), visibility: v1CharacterVisibility.default("Private") }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { characterId, visibility: linkVisibility } = c.req.valid("json");
      const link = await CampaignCharactersService.linkCharacter(c.var.requestSession, id, characterId, linkVisibility);
      return c.json(V1.campaignCharacterLink(link), 201);
    },
  )
  .post(
    "/:id/characters/:characterId/pdf",
    describeRoute({
      response: v1Export,
      status: 202,
      summary:
        "Queues a linked character's PDF, as its editors or the Game Master: its export, pending, which " +
        "`GET /v1/exports/{id}` answers until it's ready",
    }),
    apiExportRateLimit,
    validate("param", characterParams),
    async (c) => {
      const { characterId, id } = c.req.valid("param");
      const pending = await CampaignCharactersService.enqueuePdf(c.var.requestSession, id, characterId);
      return c.json(V1.export(pending), 202);
    },
  )
  .put(
    "/:id/characters/:characterId",
    describeRoute({
      response: v1CampaignCharacterLink,
      status: 200,
      summary: "Changes what a campaign's other players see of a character the key's user linked",
    }),
    validate("param", characterParams),
    validate("json", z.object({ visibility: v1CharacterVisibility })),
    async (c) => {
      const { characterId, id } = c.req.valid("param");
      const { visibility: linkVisibility } = c.req.valid("json");
      const link = await CampaignCharactersService.updateCharacterVisibility(
        c.var.requestSession,
        id,
        characterId,
        linkVisibility,
      );
      return c.json(V1.campaignCharacterLink(link), 200);
    },
  );
