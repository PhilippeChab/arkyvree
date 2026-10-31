import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, importRateLimit, validate } from "@/server/middlewares/index.ts";
import { characterFields, idList, idParam, limit, orderDirDesc, page, score } from "@/server/routers/api/validation.ts";
import {
  v1Character,
  v1CharacterPage,
  v1Creation,
  v1CreationOptionPage,
  v1ImportedCharacter,
  v1LinkRoom,
} from "@/server/routers/v1/schemas/characters.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { MAX_CHARACTER_NAME_LENGTH, MAX_IMPORT_FILE_LENGTH } from "@/shared/characters.ts";

import contributors from "./contributors/index.ts";
import inventory from "./inventory/index.ts";
import levels from "./levels/index.ts";
import modifiers from "./modifiers/index.ts";
import pdf from "./pdf/index.ts";
import sharing from "./sharing/index.ts";

/** A creation pick's role: its single link's (3.5's `race`). */
const creationParams = z.object({
  role: z.string().meta({ description: "The pick's role, as the rules name it (3.5: `race`)" }),
});

/** A character's links of a role (3.5's `speaks`, the languages it speaks). */
const roleParams = idParam.extend({
  role: z.string().meta({ description: "The links' role, as the rules name it (3.5: `speaks`)" }),
});

/** A character's scores of a role (3.5's `score`, its ability scores). */
const scoreParams = idParam.extend({ role: z.string().meta({ description: "The scores' role: `score`" }) });

/**
 * The key's user's characters: a page of them, one's sheet and its links of a role; its inventory, its own modifiers
 * and its levels, each a router of its own.
 */
export default new Hono<ApiKeyContext>()
  .route("/", contributors)
  .route("/", inventory)
  .route("/", levels)
  .route("/", modifiers)
  .route("/", pdf)
  .route("/", sharing)
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
    "/creation",
    describeRoute({
      response: v1Creation,
      status: 200,
      summary: "How a new character of a ruleset sets its scores of a role (3.5: its ability scores)",
    }),
    validate(
      "query",
      z.object({
        role: z.string().meta({ description: "The scores' role: `score`" }),
        rulesetId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { role, rulesetId } = c.req.valid("query");
      return c.json(V1.creation(await CharactersService.getCreation(c.var.requestSession, rulesetId, role)), 200);
    },
  )
  .get(
    "/creation/:role",
    describeRoute({
      response: v1CreationOptionPage,
      status: 200,
      summary: "A page of a new character's creation pick's options (3.5: its race), each eligible or not",
    }),
    validate("param", creationParams),
    validate(
      "query",
      z
        .object({
          limit,
          page,
          rulesetId: z.string().uuid(),
          search: z.string().optional().meta({ description: "A part of the name" }),
        })
        .catchall(z.string())
        .meta({ description: "Past these, the new character's fields that narrow the options, by their keys" }),
    ),
    async (c) => {
      const { role } = c.req.valid("param");
      const { limit, page, rulesetId, search, ...narrowing } = c.req.valid("query");
      const options = await CharactersService.getCreationOptions(
        c.var.requestSession,
        rulesetId,
        role,
        narrowing,
        { search },
        { limit, page },
      );
      return c.json(V1.page(options, V1.creationOption), 200);
    },
  )
  .get(
    "/:id",
    describeRoute({
      response: v1Character,
      status: 200,
      summary: "A character's sheet: its sections, as the app shows them, and what the rules find wrong with it",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, id)), 200);
    },
  )
  .get(
    "/:id/links/:role",
    describeRoute({
      response: v1LinkRoom,
      status: 200,
      summary:
        "A character's links of a role (3.5: the languages it `speaks`): those it picked, those it has anyway, " +
        "and those it may pick",
    }),
    validate("param", roleParams),
    validate(
      "query",
      z.object({
        entityIds: idList.meta({
          description:
            "The picks being made, comma-separated, whose room it weighs: none when it's left out (the sheet's " +
            "fields section lists the character's own)",
        }),
      }),
    ),
    async (c) => {
      const { id, role } = c.req.valid("param");
      const { entityIds = [] } = c.req.valid("query");
      const room = await CharactersService.getLinkPicks(c.var.requestSession, id, role, entityIds);
      return c.json(V1.linkRoom(room), 200);
    },
  )
  .post(
    "/",
    describeRoute({ response: v1Character, status: 201, summary: "Creates a character, answering its sheet" }),
    validate(
      "json",
      z.object({
        fields: characterFields.meta({ description: "Its fields, by the keys its ruleset's form gives them" }),
        name: z.string().min(1).max(MAX_CHARACTER_NAME_LENGTH),
        notes: z.string().optional(),
        picks: z
          .record(z.string(), z.string().uuid())
          .meta({ description: "The entity each creation pick names, by its role (3.5: `race`)" }),
        rulesetId: z.string().uuid(),
        scores: z
          .record(z.string(), z.record(z.string().uuid(), score))
          .meta({ description: "Each scored role's amounts, by entity (3.5: `score`, its ability scores)" }),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      const created = await CharactersService.createCharacter(c.var.requestSession, body);
      return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, created.id)), 201);
    },
  )
  .post(
    "/import",
    describeRoute({
      response: v1ImportedCharacter,
      status: 201,
      summary:
        "Imports the character another program's file holds into a ruleset, as its rules import it (3.5: a PCGen file)",
    }),
    importRateLimit,
    validate(
      "json",
      z.object({
        rulesetId: z.string().uuid(),
        text: z.string().min(1).max(MAX_IMPORT_FILE_LENGTH).meta({ description: "The file's text" }),
      }),
    ),
    async (c) => {
      const { rulesetId, text } = c.req.valid("json");
      const { character, report } = await CharactersService.importCharacter(c.var.requestSession, rulesetId, text);
      const sheet = await CharactersService.getCharacter(c.var.requestSession, character.id);
      return c.json(V1.importedCharacter(sheet, report), 201);
    },
  )
  // Reads that take a plan, too long for a query: each answers what it comes to, and changes nothing
  .post(
    "/:id/unarchive",
    describeRoute({ response: v1Character, status: 200, summary: "Unarchives a character, answering its sheet" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await CharactersService.unarchiveCharacter(c.var.requestSession, id);
      return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, id)), 200);
    },
  )
  .put(
    "/:id",
    describeRoute({
      response: v1Character,
      status: 200,
      summary: "Updates a character's name, fields, notes or links, answering its sheet",
    }),
    validate("param", idParam),
    validate(
      "json",
      z.object({
        fields: characterFields.optional().meta({ description: "Its fields, by the keys its sheet gives them" }),
        links: z
          .record(z.string(), z.array(z.string().uuid()))
          .optional()
          .meta({ description: "Each picked link's picks, by role: `speaks`" }),
        name: z.string().min(1).max(MAX_CHARACTER_NAME_LENGTH).optional(),
        notes: z.string().optional(),
        privateNotes: z.string().optional(),
        updatedAt: z.string().optional().meta({ description: "When it was read: refused if it changed since (409)" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      await CharactersService.updateCharacter(c.var.requestSession, id, body);
      return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, id)), 200);
    },
  )
  .put(
    "/:id/scores/:role",
    describeRoute({
      response: v1Character,
      status: 200,
      summary: "Sets a character's scores of a role (3.5: its ability scores), answering its sheet",
    }),
    validate("param", scoreParams),
    validate("json", z.record(z.string().uuid(), score).meta({ description: "Each score, by its entity" })),
    async (c) => {
      const { id, role } = c.req.valid("param");
      const body = c.req.valid("json");
      await CharactersService.updateScores(c.var.requestSession, id, role, body);
      return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, id)), 200);
    },
  )
  .delete(
    "/:id",
    describeRoute({ response: null, status: 204, summary: "Archives a character" }),
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
