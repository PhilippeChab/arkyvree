import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, levelChoicesRateLimit, validate } from "@/server/middlewares/index.ts";
import { buildPickPairsSchema } from "@/server/routers/api/schemaBuilders.ts";
import { idList, idParam, increaseList, orderDirDesc, skillPoints } from "@/server/routers/api/validation.ts";
import {
  v1CharacterLanguages,
  v1CharacterModifiers,
  v1Inventory,
  v1SavedLevel,
} from "@/server/routers/v1/schemas/characterParts.ts";
import { v1Character, v1CharacterPage } from "@/server/routers/v1/schemas/characters.ts";
import { v1LevelChoices } from "@/server/routers/v1/schemas/levelChoices.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
import { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";

const levelParams = idParam.extend({ levelId: z.string().uuid() });

/**
 * The key's user's characters: a page of them, one's sheet, its choices at its next level, and the parts its edits
 * change (its inventory, its own modifiers, its languages, a level it took).
 */
export default new Hono<ApiKeyContext>()
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
    "/:id",
    describeRoute({ response: v1Character, status: 200, summary: "A character's sheet, with its bonded creatures'" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, id)), 200);
    },
  )
  .get(
    "/:id/inventory",
    describeRoute({ response: v1Inventory, status: 200, summary: "A character's inventory" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.inventory(await CharacterInventoryService.getInventory(c.var.requestSession, id)), 200);
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
  // A level's choices: the classes the character can take, and for a planned level of `classId`, what each step offers
  // with its picks so far
  .get(
    "/:id/level-choices",
    describeRoute({
      response: v1LevelChoices,
      status: 200,
      summary:
        "A character's choices at its next level: the classes it can take, and for a planned level of `classId`, " +
        "what each step offers given the picks so far",
    }),
    levelChoicesRateLimit,
    validate("param", idParam),
    validate(
      "query",
      z.object({
        abilityIncreases: increaseList
          .optional()
          .meta({ description: "The ability increases picked so far: `abilityId:amount;…`" }),
        classId: z.string().uuid().optional().meta({ description: "The class the planned level is a level of" }),
        feats: buildPickPairsSchema("featId").meta({
          description: "The feats picked so far, each in its aptitude: `featId:aptitudeId,…`",
        }),
        skillPoints: skillPoints.meta({ description: "The skill points spent so far: `skillId:points,…`" }),
        spells: buildPickPairsSchema("spellId").meta({
          description: "The spells picked so far, each in its aptitude: `spellId:aptitudeId,…`",
        }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const query = c.req.valid("query");
      const choices = await CharacterLevelsService.getLevelChoices(
        c.var.requestSession,
        id,
        V1.levelChoicesQuery(query),
      );
      return c.json(V1.levelChoices(choices), 200);
    },
  )
  .get(
    "/:id/levels/:levelId",
    describeRoute({
      response: v1SavedLevel,
      status: 200,
      summary: "A level a character took: its class, hit points, ability increases and picks",
    }),
    validate("param", levelParams),
    async (c) => {
      const { id, levelId } = c.req.valid("param");
      return c.json(V1.savedLevel(await CharacterLevelsService.getLevel(c.var.requestSession, id, levelId)), 200);
    },
  )
  .get(
    "/:id/modifiers",
    describeRoute({
      response: v1CharacterModifiers,
      status: 200,
      summary: "A character's own modifiers, which its owner adds",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json((await CharacterModifiersService.getModifiers(c.var.requestSession, id)).map(V1.modifier), 200);
    },
  );
