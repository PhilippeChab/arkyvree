import { toJson } from "@/server/errors/index.ts";
import { denyDemoUser, exportRateLimit, sessionMiddleware } from "@/server/middlewares/index.ts";
import { visibilityMap } from "@/server/repositories/BaseRepository.ts";
import { limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import CharactersService from "@/server/services/CharactersService.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { buildBondedMap, buildBondedResponse, buildFullCharacterResponse } from "@/server/rulesets/dnd3.5/buildCharacterResponse.ts";
import contributors from "./contributors/index.ts";
import inventory from "./inventory/index.ts";
// Level-up flows are currently 3.5-shaped (aptitude pools in query params,
// spell levels, wizard schools). When a second ruleset ships, dispatch by
// ruleset at this layer and pick the matching implementation.
import levels from "./levels/dnd3.5/index.ts";
import modifiers from "./modifiers/index.ts";

const characters = new Hono()
  .use(sessionMiddleware)
  .route("/", contributors)
  .route("/levels", levels)
  .route("/inventory", inventory)
  .route("/modifiers", modifiers)
  // Get available races for character creation (annotated with eligibility)
  .get(
    "/available-races",
    zValidator(
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
      const result = await CharactersService.initialize().call(
        "getAvailableRaces",
        rulesetId,
        { alignment, gender },
        { search },
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
  // Create a new character
  .post(
    "/",
    zValidator(
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
        height: z.string().optional().transform(v => v || undefined),
        weight: z.string().optional().transform(v => v || undefined),
        deity: z.string().optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
      }),
    ),
    async (c) => {
      const characterData = c.req.valid("json");

      // Use the service to create character with session for activity logging
      const result = await CharactersService.initialize().call(
        "createCharacter",
        c.var.requestSession,
        characterData,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 201);
    },
  )
  // List all characters
  .get(
    "/",
    zValidator(
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
      const query = c.req.valid("query");

      const visibility = visibilityMap[query.visibility];

      // Use the service to get character list with session for activity logging
      const result = await CharactersService.initialize().call(
        "getMyCharacters",
        c.var.requestSession,
        { visibility, search: query.search, orderBy: query.orderBy, orderDir: query.orderDir, accessRole: query.accessRole },
        { limit: query.limit, page: query.page },
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  // Get characters not in a campaign
  .get(
    "/unlinked/:campaignId",
    zValidator("param", z.object({ campaignId: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
      }),
    ),
    async (c) => {
      const { campaignId } = c.req.valid("param");
      const query = c.req.valid("query");
      const result = await CharactersService.initialize().call(
        "getUnlinkedCharacters",
        c.var.requestSession,
        campaignId,
        { search: query.search },
        { limit: query.limit, page: query.page },
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  // Enqueue async PDF generation
  .post(
    "/:characterId/pdf",
    denyDemoUser,
    exportRateLimit,
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    async (c) => {
      const { characterId } = c.req.valid("param");

      const result = await CharactersService.initialize().call(
        "enqueuePdf",
        c.var.requestSession,
        characterId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json({ message: "PDF generation started" }, 202);
    },
  )
  // Update character
  .put(
    "/:id",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1).max(255).optional(),
        age: z.number().optional(),
        gender: z.enum(["Male", "Female", "Other"]).optional(),
        height: z.string().optional(),
        weight: z.string().optional(),
        deity: z.string().optional(),
        xp: z.number().optional(),
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
        ]).optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
        languageIds: z.array(z.string().uuid()).optional(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const updateData = c.req.valid("json");

      // Use the service to update character with session for activity logging
      const result = await CharactersService.initialize().call(
        "updateCharacter",
        c.var.requestSession,
        id,
        updateData,
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
    "/:id/languages",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator("json", z.object({ languageIds: z.array(z.string().uuid()) })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { languageIds } = c.req.valid("json");

      const result = await CharactersService.initialize().call(
        "updateLanguages",
        c.var.requestSession,
        id,
        languageIds,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json({ success: true }, 200);
    },
  )
  .put(
    "/:id/abilities",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.record(z.string().uuid(), z.number().int().min(1).max(100)),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const abilities = c.req.valid("json");

      const result = await CharactersService.initialize().call(
        "updateAbilities",
        c.var.requestSession,
        id,
        abilities,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json({ success: true }, 200);
    },
  )
  // Get character data
  .get(
    "/:id",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
    const { id } = c.req.valid("param");

    // Use the service to get character data with session for activity logging
    const result = await CharactersService.initialize().call(
      "getCharacter",
      c.var.requestSession,
      id,
    );
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    const { character, detailedCharacter, bondedByKind } = result[1];

    if (character.kind !== "pc") {
      const response = buildBondedResponse(
        character,
        detailedCharacter as Parameters<typeof buildBondedResponse>[1],
      );
      return c.json({ ...response, bonded: {} as Record<string, ReturnType<typeof buildBondedResponse>> }, 200);
    }

    const response = buildFullCharacterResponse(character, detailedCharacter);
    return c.json({ ...response, bonded: buildBondedMap(bondedByKind) }, 200);
  })
  // Archive character
  .delete(
    "/:id",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const result = await CharactersService.initialize().call(
        "archiveCharacter",
        c.var.requestSession,
        id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json({ message: "Character archived successfully" }, 200);
    },
  )
  // Generate share token
  .post(
    "/:id/share",
    denyDemoUser,
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const result = await CharactersService.initialize().call(
        "generateShareToken",
        c.var.requestSession,
        id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  // Revoke share token
  .delete(
    "/:id/share",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const result = await CharactersService.initialize().call(
        "revokeShareToken",
        c.var.requestSession,
        id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  // Permanently delete an archived character
  .delete(
    "/:id/permanent",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const result = await CharactersService.initialize().call(
        "hardDeleteCharacter",
        c.var.requestSession,
        id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json({ message: "Character permanently deleted" }, 200);
    },
  )
  // Unarchive character
  .post(
    "/:id/unarchive",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const result = await CharactersService.initialize().call(
        "unarchiveCharacter",
        c.var.requestSession,
        id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json({ message: "Character unarchived successfully" }, 200);
    },
  );

export default characters;
