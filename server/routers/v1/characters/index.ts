import { Hono } from "hono";
import { z } from "zod";

import { apiImportRateLimit, type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idList, idParam, orderDirDesc } from "@/server/routers/api/validation.ts";
import {
  v1CharacterCreation,
  v1CharacterLanguages,
  v1ImportedCharacter,
  v1ImportSource,
  v1RaceOptionPage,
} from "@/server/routers/v1/schemas/characterParts.ts";
import { v1Character, v1CharacterPage } from "@/server/routers/v1/schemas/characters.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { MAX_CHARACTER_NAME_LENGTH, MAX_IMPORT_FILE_LENGTH } from "@/shared/characters.ts";
import { ALIGNMENT_OPTIONS, GENDER_OPTIONS } from "@/shared/enums.ts";

import inventory from "./inventory/index.ts";
import levels from "./levels/index.ts";
import modifiers from "./modifiers/index.ts";

/** A character's ability scores, by ability id: those a new one's form leaves out start at the ruleset's start. */
const abilityScores = z
  .record(z.string().uuid(), z.number().int())
  .meta({ description: "Its ability scores, by ability id (`GET /v1/characters/creation`)" });

/** What a character file another program saved is: its text. */
const fileText = z.string().min(1).max(MAX_IMPORT_FILE_LENGTH).meta({ description: "The file's text" });

/**
 * The key's user's characters: a page of them, one's sheet, its languages, a new one's form (how it scores its
 * abilities, the races it may be), its create, its import from another program's file, its edits and its archive; and
 * its inventory, its levels and its own modifiers, each a router of its own.
 */
export default new Hono<ApiKeyContext>()
  .route("/", inventory)
  .route("/", levels)
  .route("/", modifiers)
  .get(
    "/",
    describeRoute({ response: v1CharacterPage, status: 200, summary: "The key's user's characters, a page at a time" }),
    validate(
      "query",
      z.object({
        ...PAGE_FILTERS,
        accessRole: z
          .enum(["owner", "contributor"])
          .optional()
          .meta({ description: "Only those the user owns, or only those they contribute to" }),
        orderBy: z.enum(["name", "createdAt", "lastChangedAt"]).default("lastChangedAt"),
        orderDir: orderDirDesc,
        search: z.string().optional().meta({ description: "A part of the name" }),
        visibility: z
          .enum(["active", "archived", "all"])
          .default("active")
          .meta({ description: "Its active characters, its archived ones, or both" }),
      }),
    ),
    async (c) => {
      const { accessRole, limit, orderBy, orderDir, page, search, visibility } = c.req.valid("query");
      const characters = await CharactersService.getCharacters(
        c.var.requestSession,
        { accessRole, orderBy, orderDir, search, visibility },
        { limit, page },
      );
      return c.json(V1.characters(characters), 200);
    },
  )
  .get(
    "/available-races",
    describeRoute({
      response: v1RaceOptionPage,
      status: 200,
      summary: "The races a new character of a ruleset may be, each saying whether one of its alignment and gender may",
    }),
    validate(
      "query",
      z.object({
        ...PAGE_FILTERS,
        alignment: z.enum(ALIGNMENT_OPTIONS).optional(),
        gender: z.enum(GENDER_OPTIONS).optional(),
        rulesetId: z.string().uuid(),
        search: z.string().optional().meta({ description: "A part of the name" }),
      }),
    ),
    async (c) => {
      const { alignment, gender, limit, page, rulesetId, search } = c.req.valid("query");
      const races = await CharactersService.getAvailableRaces(
        rulesetId,
        { alignment, gender },
        { search },
        { limit, page },
      );
      return c.json(V1.page(races, V1.raceOption), 200);
    },
  )
  .get(
    "/creation",
    describeRoute({
      response: v1CharacterCreation,
      status: 200,
      summary: "How a new character of a ruleset sets its ability scores: its abilities, the ways, and the bounds",
    }),
    validate("query", z.object({ rulesetId: z.string().uuid() })),
    async (c) => {
      const { rulesetId } = c.req.valid("query");
      return c.json(V1.characterCreation(await CharactersService.getCreation(rulesetId)), 200);
    },
  )
  .get(
    "/:id",
    describeRoute({ response: v1Character, status: 200, summary: "A character's sheet, with its bonded creatures'" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, id)), 200);
    },
  )
  .get(
    "/:id/languages",
    describeRoute({
      response: v1CharacterLanguages,
      status: 200,
      summary: "What a character speaks, and what picking the languages `languageIds` names leaves it room for",
    }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        languageIds: idList.meta({
          description: "Comma-separated: the languages it would pick, whose room the answer checks",
        }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { languageIds = [] } = c.req.valid("query");
      const languages = await CharactersService.getLanguages(c.var.requestSession, id, languageIds);
      return c.json(V1.characterLanguages(languages), 200);
    },
  )
  .post(
    "/",
    describeRoute({
      response: v1Character,
      status: 201,
      summary: "Creates a character of level 0 in a ruleset: its levels are then saved one at a time (`levels`)",
    }),
    validate(
      "json",
      z.object({
        abilities: abilityScores,
        age: z.number().int().min(1).optional(),
        alignment: z.enum(ALIGNMENT_OPTIONS),
        deity: z.string().optional(),
        description: z.string().optional(),
        gender: z.enum(GENDER_OPTIONS),
        height: z
          .string()
          .optional()
          .transform((value) => value || undefined),
        name: z.string().min(1).max(MAX_CHARACTER_NAME_LENGTH),
        notes: z.string().optional(),
        raceId: z.string().uuid().meta({ description: "A race it may be (`GET /v1/characters/available-races`)" }),
        rulesetId: z.string().uuid(),
        weight: z
          .string()
          .optional()
          .transform((value) => value || undefined),
        xp: z.number().int().min(0).default(0),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      const session = c.var.requestSession;
      const character = await CharactersService.createCharacter(session, body);
      return c.json(V1.character(await CharactersService.getCharacter(session, character.id)), 201);
    },
  )
  .post(
    "/import",
    describeRoute({
      response: v1ImportedCharacter,
      status: 201,
      summary:
        "Creates the character another program's file holds (a PCGen file) in a ruleset, with the report of what " +
        "it imported and what it couldn't",
    }),
    apiImportRateLimit,
    validate("json", z.object({ rulesetId: z.string().uuid(), text: fileText })),
    async (c) => {
      const { rulesetId, text } = c.req.valid("json");
      const session = c.var.requestSession;
      const { character, report } = await CharactersService.importCharacter(session, rulesetId, text);
      const sheet = await CharactersService.getCharacter(session, character.id);
      return c.json(V1.importedCharacter(sheet, report), 201);
    },
  )
  .post(
    "/import/source",
    describeRoute({
      response: v1ImportSource,
      status: 200,
      summary: "What a character file another program saved is, and the base rules whose rulesets import it",
    }),
    validate("json", z.object({ text: fileText })),
    (c) => {
      const { text } = c.req.valid("json");
      return c.json(V1.importSource(CharactersService.getImportSource(text)), 200);
    },
  )
  .post(
    "/:id/unarchive",
    describeRoute({ response: v1Character, status: 200, summary: "Unarchives a character" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      const session = c.var.requestSession;
      await CharactersService.unarchiveCharacter(session, id);
      return c.json(V1.character(await CharactersService.getCharacter(session, id)), 200);
    },
  )
  .put(
    "/:id",
    describeRoute({
      response: v1Character,
      status: 200,
      summary: "Changes a character's identity, experience and languages: what the body names",
    }),
    validate("param", idParam),
    validate(
      "json",
      z.object({
        age: z.number().int().min(1).nullable().optional().meta({ description: "Cleared with null" }),
        alignment: z.enum(ALIGNMENT_OPTIONS).optional(),
        deity: z.string().optional(),
        description: z.string().optional(),
        gender: z.enum(GENDER_OPTIONS).optional(),
        height: z.string().nullable().optional().meta({ description: "Cleared with null" }),
        languageIds: z
          .array(z.string().uuid())
          .optional()
          .meta({ description: "The languages it picks, past those its race and classes give it: its whole list" }),
        name: z.string().min(1).max(MAX_CHARACTER_NAME_LENGTH).optional(),
        notes: z.string().optional(),
        weight: z.string().nullable().optional().meta({ description: "Cleared with null" }),
        xp: z.number().int().min(0).optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const session = c.var.requestSession;
      await CharactersService.updateCharacter(session, id, body);
      return c.json(V1.character(await CharactersService.getCharacter(session, id)), 200);
    },
  )
  .put(
    "/:id/abilities",
    describeRoute({ response: v1Character, status: 200, summary: "Changes a character's ability scores" }),
    validate("param", idParam),
    validate("json", z.object({ scores: abilityScores })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { scores } = c.req.valid("json");
      const session = c.var.requestSession;
      await CharactersService.updateAbilities(session, id, scores);
      return c.json(V1.character(await CharactersService.getCharacter(session, id)), 200);
    },
  )
  .put(
    "/:id/languages",
    describeRoute({
      response: v1CharacterLanguages,
      status: 200,
      summary: "Changes the languages a character picks, past those its race and classes give it",
    }),
    validate("param", idParam),
    validate("json", z.object({ languageIds: z.array(z.string().uuid()).meta({ description: "Its whole list" }) })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { languageIds } = c.req.valid("json");
      const session = c.var.requestSession;
      await CharactersService.updateLanguages(session, id, languageIds);
      return c.json(V1.characterLanguages(await CharactersService.getLanguages(session, id, languageIds)), 200);
    },
  )
  .delete(
    "/:id",
    describeRoute({ response: null, status: 204, summary: "Archives a character: it can be unarchived" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await CharactersService.archiveCharacter(c.var.requestSession, id);
      return c.body(null, 204);
    },
  )
  .delete(
    "/:id/permanent",
    describeRoute({ response: null, status: 204, summary: "Deletes an archived character for good" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await CharactersService.hardDeleteCharacter(c.var.requestSession, id);
      return c.body(null, 204);
    },
  );
