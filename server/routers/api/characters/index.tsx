import { Hono } from "hono";
import { z } from "zod";

import { denyDemoUser, exportRateLimit, sessionMiddleware, validate } from "@/server/middlewares/index.ts";
import { characterIdParam, idParam, limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { ALIGNMENT_OPTIONS, GENDER_OPTIONS } from "@/shared/enums.ts";

import contributors from "./contributors/index.ts";
import inventory from "./inventory/index.ts";
import levels from "./levels/index.ts";
import modifiers from "./modifiers/index.ts";
import sharing from "./sharing/index.ts";

/** A character's ability score. */
const abilityScore = z.number().int();

const campaignIdParam = z.object({ campaignId: z.string().uuid() });

export default new Hono()
  .use(sessionMiddleware)
  .route("/", contributors)
  .route("/levels", levels)
  .route("/inventory", inventory)
  .route("/modifiers", modifiers)
  .route("/", sharing)
  .get(
    "/",
    validate(
      "query",
      z.object({
        limit,
        page,
        visibility: z.enum(["all", "archived", "active"]).default("active"),
        search: z.string().optional(),
        orderBy: z.enum(["name", "createdAt", "lastChangedAt"]).default("lastChangedAt"),
        orderDir: orderDirDesc,
        accessRole: z.enum(["owner", "contributor"]).optional(),
      }),
    ),
    async (c) => {
      const { visibility, search, orderBy, orderDir, accessRole, limit, page } = c.req.valid("query");
      // Use the service to get character list with session for activity logging
      return c.json(
        await CharactersService.getCharacters(
          c.var.requestSession,
          {
            visibility,
            search,
            orderBy,
            orderDir,
            accessRole,
          },
          { limit, page },
        ),
        200,
      );
    },
  )
  // Get available races for character creation (annotated with eligibility)
  .get(
    "/available-races",
    validate(
      "query",
      z.object({
        rulesetId: z.string().uuid(),
        alignment: z.string().optional(),
        gender: z.string().optional(),
        limit,
        page,
        search: z.string().optional(),
      }),
    ),
    async (c) => {
      const { rulesetId, alignment, gender, limit, page, search } = c.req.valid("query");
      return c.json(
        await CharactersService.getAvailableRaces(rulesetId, { alignment, gender }, { search }, { limit, page }),
        200,
      );
    },
  )
  // How a new character of a ruleset sets its ability scores
  .get("/creation", validate("query", z.object({ rulesetId: z.string().uuid() })), async (c) => {
    const { rulesetId } = c.req.valid("query");
    return c.json(await CharactersService.getCreation(rulesetId), 200);
  })
  // Get characters not in a campaign
  .get(
    "/unlinked/:campaignId",
    validate("param", campaignIdParam),
    validate(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
      }),
    ),
    async (c) => {
      const { campaignId } = c.req.valid("param");
      const { search, limit, page } = c.req.valid("query");
      return c.json(
        await CharactersService.getUnlinkedCharacters(c.var.requestSession, campaignId, { search }, { limit, page }),
        200,
      );
    },
  )
  .get("/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await CharactersService.getCharacter(c.var.requestSession, id), 200);
  })
  .post(
    "/",
    validate(
      "json",
      z.object({
        rulesetId: z.string().uuid(),
        raceId: z.string().uuid(),
        name: z.string().min(1).max(255),
        xp: z.number().int().min(0),
        alignment: z.enum(ALIGNMENT_OPTIONS),
        abilities: z.record(z.string().uuid(), abilityScore),
        age: z.number().int().min(1).optional(),
        gender: z.enum(GENDER_OPTIONS),
        height: z
          .string()
          .optional()
          .transform((v) => v || undefined),
        weight: z
          .string()
          .optional()
          .transform((v) => v || undefined),
        deity: z.string().optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
        // Read by the character's editors and its campaign's Game Master only
        privateNotes: z.string().optional(),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");

      // Use the service to create character with session for activity logging
      return c.json(await CharactersService.createCharacter(c.var.requestSession, body), 201);
    },
  )
  // Enqueue async PDF generation
  .post("/:characterId/pdf", denyDemoUser, exportRateLimit, validate("param", characterIdParam), async (c) => {
    const { characterId } = c.req.valid("param");

    await CharactersService.enqueuePdf(c.var.requestSession, characterId);
    return c.json({ message: "PDF generation started" }, 202);
  })
  .post("/:id/unarchive", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    await CharactersService.unarchiveCharacter(c.var.requestSession, id);
    return c.json({ message: "Character unarchived successfully" }, 200);
  })
  .put(
    "/:id",
    validate("param", idParam),
    validate(
      "json",
      z.object({
        name: z.string().min(1).max(255).optional(),
        // An age, a height or a weight is cleared with null
        age: z.number().int().min(1).nullable().optional(),
        gender: z.enum(GENDER_OPTIONS).optional(),
        height: z.string().nullable().optional(),
        weight: z.string().nullable().optional(),
        deity: z.string().optional(),
        xp: z.number().int().min(0).optional(),
        alignment: z.enum(ALIGNMENT_OPTIONS).optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
        // Read by the character's editors and its campaign's Game Master only
        privateNotes: z.string().optional(),
        languageIds: z.array(z.string().uuid()).optional(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      // Use the service to update character with session for activity logging
      return c.json(await CharactersService.updateCharacter(c.var.requestSession, id, body), 200);
    },
  )
  .put(
    "/:id/abilities",
    validate("param", idParam),
    validate("json", z.record(z.string().uuid(), abilityScore)),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      await CharactersService.updateAbilities(c.var.requestSession, id, body);
      return c.json({ success: true }, 200);
    },
  )
  .put(
    "/:id/languages",
    validate("param", idParam),
    validate("json", z.object({ languageIds: z.array(z.string().uuid()) })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { languageIds } = c.req.valid("json");

      await CharactersService.updateLanguages(c.var.requestSession, id, languageIds);
      return c.json({ success: true }, 200);
    },
  )
  .delete("/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    await CharactersService.archiveCharacter(c.var.requestSession, id);
    return c.json({ message: "Character archived successfully" }, 200);
  })
  // Permanently delete an archived character
  .delete("/:id/permanent", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    await CharactersService.hardDeleteCharacter(c.var.requestSession, id);
    return c.json({ message: "Character permanently deleted" }, 200);
  });
