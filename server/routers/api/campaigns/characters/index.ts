import { Hono } from "hono";
import { z } from "zod";

import { denyDemoUser, exportRateLimit, type SessionContext, validate } from "@/server/middlewares/index.ts";
import { idParam, limit, page } from "@/server/routers/api/validation.ts";
import { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";
import { CHARACTER_VISIBILITY_OPTIONS } from "@/shared/campaigns.ts";

const characterParams = idParam.extend({ characterId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get(
    "/:id/characters",
    validate("param", idParam),
    validate(
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
        await CampaignCharactersService.getCharacters(
          c.var.requestSession,
          id,
          { search, orderBy, orderDir },
          { limit, page },
        ),
        200,
      );
    },
  )
  .get("/:id/characters/:characterId", validate("param", characterParams), async (c) => {
    const { id, characterId } = c.req.valid("param");
    return c.json(await CampaignCharactersService.getCharacter(c.var.requestSession, id, characterId), 200);
  })
  .post(
    "/:id/characters",
    validate("param", idParam),
    validate(
      "json",
      z.object({
        characterId: z.string().uuid(),
        visibility: z.enum(CHARACTER_VISIBILITY_OPTIONS).default("Private"),
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
  )
  // Enqueue async PDF generation of a campaign character (its editors and the Game Master)
  .post(
    "/:id/characters/:characterId/pdf",
    denyDemoUser,
    exportRateLimit,
    validate("param", characterParams),
    async (c) => {
      const { id, characterId } = c.req.valid("param");
      await CampaignCharactersService.enqueuePdf(c.var.requestSession, id, characterId);
      return c.json({ message: "PDF generation started" }, 202);
    },
  )
  .put(
    "/:id/characters/:characterId",
    validate("param", characterParams),
    validate(
      "json",
      z.object({
        visibility: z.enum(CHARACTER_VISIBILITY_OPTIONS),
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
  );
