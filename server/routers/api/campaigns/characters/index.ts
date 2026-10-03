import { Hono } from "hono";
import { z } from "zod";

import { denyDemoUser, exportRateLimit, zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { idParam, limit, page } from "@/server/routers/api/validation.ts";
import { buildBondedMap, buildFullCharacterResponse } from "@/server/rulesets/dnd3.5/buildCharacterResponse.ts";
import { redactPrivateNotes } from "@/server/rulesets/redactPrivateNotes.ts";
import { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";

export default new Hono<SessionContext>()
  .get(
    "/:id/characters/:characterId",
    zValidator("param", z.object({ id: z.string().uuid(), characterId: z.string().uuid() })),
    async (c) => {
      const { id, characterId } = c.req.valid("param");
      const data = await CampaignCharactersService.getCampaignCharacter(c.var.requestSession, id, characterId);
      const response = buildFullCharacterResponse(data.character!, data.detailedCharacter!);
      const redactForViewer = <T extends { identity: { background: { privateNotes?: string } } }>(entry: T): T =>
        data.canViewPrivateNotes ? entry : redactPrivateNotes(entry, "");
      const safeResponse = {
        ...redactForViewer(response),
        shareToken: data.canEdit ? response.shareToken : null,
      };
      // Explicit allowlist: a new full-response field must be considered here.
      const visibleResponse = data.isPartial
        ? ({
            id: safeResponse.id,
            userId: safeResponse.userId,
            kind: safeResponse.kind,
            parentCharacterId: safeResponse.parentCharacterId,
            name: safeResponse.name,
            raceId: safeResponse.raceId,
            rulesetId: safeResponse.rulesetId,
            rulesetName: safeResponse.rulesetName,
            baseRules: safeResponse.baseRules,
            isCustomRuleset: safeResponse.isCustomRuleset,
            deletedAt: safeResponse.deletedAt,
            updatedAt: safeResponse.updatedAt,
            shareToken: null,
            identity: safeResponse.identity,
            skillBudget: { available: 0, spent: 0, total: 0 },
            abilities: {},
            combat: {},
            savingThrows: {},
            classes: {},
            skills: {},
            inventory: {},
            equipment: [],
            powers: [],
            virtualFeats: [],
            virtualPowers: [],
            aptitudes: {},
            spellTags: {},
            requirements: {},
            modifiers: {},
            validation: { valid: true, issues: [] },
          } satisfies Record<keyof typeof response, unknown>)
        : safeResponse;

      return c.json(
        {
          visibility: data.visibility,
          isOwner: data.isOwner,
          canEdit: data.canEdit,
          canDownloadPdf: data.canDownloadPdf,
          isPartial: data.isPartial,
          ...visibleResponse,
          bonded: data.isPartial ? {} : buildBondedMap(data.bondedByKind ?? {}, redactForViewer),
        },
        200,
      );
    },
  )
  // Enqueue async PDF generation of a campaign character (its editors and the Game Master)
  .post(
    "/:id/characters/:characterId/pdf",
    denyDemoUser,
    exportRateLimit,
    zValidator("param", z.object({ id: z.string().uuid(), characterId: z.string().uuid() })),
    async (c) => {
      const { id, characterId } = c.req.valid("param");
      await CampaignCharactersService.enqueueCampaignCharacterPdf(c.var.requestSession, id, characterId);
      return c.json({ message: "PDF generation started" }, 202);
    },
  )
  .put(
    "/:id/characters/:characterId",
    zValidator("param", z.object({ id: z.string().uuid(), characterId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        visibility: z.enum(["Private", "Public", "Partial"]),
      }),
    ),
    async (c) => {
      const { id, characterId } = c.req.valid("param");
      const { visibility } = c.req.valid("json");
      return c.json(
        await CampaignCharactersService.updateCharacterVisibility(c.var.requestSession, id, characterId, visibility),
        200,
      );
    },
  )
  .get(
    "/:id/characters",
    zValidator("param", idParam),
    zValidator(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        orderBy: z.enum(["createdAt", "updatedAt"]).optional(),
        orderDir: z.enum(["asc", "desc"]).optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, orderBy, orderDir } = c.req.valid("query");
      return c.json(
        await CampaignCharactersService.getCampaignCharacters(
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
    "/:id/characters",
    zValidator("param", idParam),
    zValidator(
      "json",
      z.object({
        characterId: z.string().uuid(),
        visibility: z.enum(["Private", "Public", "Partial"]).default("Private"),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { characterId, visibility } = c.req.valid("json");
      return c.json(
        await CampaignCharactersService.linkCharacter(c.var.requestSession, id, characterId, visibility),
        201,
      );
    },
  );
