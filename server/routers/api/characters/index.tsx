/**
 * Level-up flows are currently 3.5-shaped (aptitude pools in query params, spell levels, wizard schools). When a second
 * ruleset ships, dispatch by ruleset at this layer and pick the matching implementation.
 */

import { Hono } from "hono";
import { z } from "zod";

import { denyDemoUser, exportRateLimit, sessionMiddleware, validate } from "@/server/middlewares/index.ts";
import { characterIdParam, idParam, limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { buildBondedMap, buildBondedResponse, buildFullCharacterResponse } from "@/server/rulesets/dnd3.5/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";

import contributors from "./contributors/index.ts";
import inventory from "./inventory/index.ts";
import levels from "./levels/dnd3.5/index.ts";
import modifiers from "./modifiers/index.ts";
import sharing from "./sharing/index.ts";

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
        orderBy: z.enum(["name", "createdAt", "updatedAt"]).default("createdAt"),
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

    // Use the service to get character data with session for activity logging
    const { character, detailedCharacter, bondedByKind } = await CharactersService.getCharacter(
      c.var.requestSession,
      id,
    );

    if (character.kind !== "pc") {
      const response = buildBondedResponse(character, detailedCharacter as Parameters<typeof buildBondedResponse>[1]);
      return c.json({ ...response, bonded: {} as Record<string, ReturnType<typeof buildBondedResponse>> }, 200);
    }

    const response = buildFullCharacterResponse(character, detailedCharacter);
    return c.json({ ...response, bonded: buildBondedMap(bondedByKind) }, 200);
  })
  .post(
    "/",
    validate(
      "json",
      z.object({
        rulesetId: z.string().uuid(),
        raceId: z.string().uuid(),
        name: z.string().min(1).max(255),
        xp: z.number().min(0),
        alignment: z.enum([
          "Lawful Good",
          "Neutral Good",
          "Chaotic Good",
          "Lawful Neutral",
          "True Neutral",
          "Chaotic Neutral",
          "Lawful Evil",
          "Neutral Evil",
          "Chaotic Evil",
        ]),
        abilities: z.record(z.string().uuid(), z.number().min(1).max(100)),
        age: z.number().min(1).optional(),
        gender: z.enum(["Male", "Female", "Other"]),
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
        age: z.number().optional(),
        gender: z.enum(["Male", "Female", "Other"]).optional(),
        height: z.string().optional(),
        weight: z.string().optional(),
        deity: z.string().optional(),
        xp: z.number().optional(),
        alignment: z
          .enum([
            "Lawful Good",
            "Neutral Good",
            "Chaotic Good",
            "Lawful Neutral",
            "True Neutral",
            "Chaotic Neutral",
            "Lawful Evil",
            "Neutral Evil",
            "Chaotic Evil",
          ])
          .optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
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
    validate("json", z.record(z.string().uuid(), z.number().int().min(1).max(100))),
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
