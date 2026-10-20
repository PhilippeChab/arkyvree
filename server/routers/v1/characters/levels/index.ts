import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, levelChoicesRateLimit, validate } from "@/server/middlewares/index.ts";
import { buildPickPairsSchema } from "@/server/routers/api/schemaBuilders.ts";
import { idParam, increaseList, skillPoints } from "@/server/routers/api/validation.ts";
import { v1SavedLevel } from "@/server/routers/v1/schemas/characterParts.ts";
import { v1Character } from "@/server/routers/v1/schemas/characters.ts";
import { v1LevelChoices } from "@/server/routers/v1/schemas/levelChoices.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";

/** A level's ability increases: each an ability, and how much. */
const abilityIncreases = z
  .array(z.object({ abilityId: z.string().uuid(), amount: z.number().int().min(1) }))
  .meta({ description: "Its ability increases, when the level takes one: each an ability, and how much" });

/** The feats a level picks, each in its aptitude. */
const featPicks = z
  .array(z.object({ aptitudeId: z.string().uuid(), featId: z.string().uuid() }))
  .meta({ description: "The feats it picks, each in its aptitude (`level-choices`' feat slots)" });

/** Whether a level's save or edit stands though the rules find the character wrong with it. */
const force = z
  .boolean()
  .default(false)
  .meta({ description: "Save it even when the rules find the character wrong with it: what they find is refused" });

/** The hit points a level gives. */
const hitPoints = z.number().int().min(1).meta({ description: "What its hit die gave it" });

const levelParams = idParam.extend({ levelId: z.string().uuid() });

/** The skill points a level spends, by skill. */
const levelSkillPoints = z
  .record(z.string().uuid(), z.number().int().min(0))
  .meta({ description: "The points it spends, by skill id" });

/** The spells a level picks, each in its aptitude. */
const spellPicks = z
  .array(z.object({ aptitudeId: z.string().uuid(), spellId: z.string().uuid() }))
  .meta({ description: "The spells it picks, each in its aptitude (`level-choices`' spell slots)" });

/**
 * A character's levels: its choices at its next level, which a caller reads given its picks so far, then saves whole,
 * as the app saves one; a level it took, read and changed; and its latest level, removed.
 */
export default new Hono<ApiKeyContext>()
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
  .post(
    "/:id/levels",
    describeRoute({
      response: v1Character,
      status: 201,
      summary:
        "Saves a character's next level whole, as `level-choices` offers it: its class, hit points, ability " +
        "increases, skills, feats and spells. Answers the character's sheet",
    }),
    validate("param", idParam),
    validate(
      "json",
      z.object({
        abilityIncreases: abilityIncreases.default([]),
        classId: z.string().uuid(),
        feats: featPicks.default([]),
        force,
        hitPoints,
        skillPoints: levelSkillPoints.default({}),
        spells: spellPicks.default([]),
        level: z
          .number()
          .int()
          .min(1)
          .meta({ description: "The class's level it is: `level-choices`' `level.class.level`" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const session = c.var.requestSession;
      const { feats, force, levels, powers, skills } = V1.levelSaveRequest(body);
      await CharacterLevelsService.finalizeLevelUp(session, id, levels, skills, feats, powers, force);
      return c.json(V1.character(await CharactersService.getCharacter(session, id)), 201);
    },
  )
  .put(
    "/:id/levels/:levelId",
    describeRoute({
      response: v1SavedLevel,
      status: 200,
      summary: "Changes a level a character took: what the body names of its hit points, ability increases and picks",
    }),
    validate("param", levelParams),
    validate(
      "json",
      z.object({
        abilityIncreases: abilityIncreases.optional(),
        feats: featPicks.optional(),
        force,
        hitPoints: hitPoints.optional(),
        skillPoints: levelSkillPoints.optional(),
        spells: spellPicks.optional(),
      }),
    ),
    async (c) => {
      const { id, levelId } = c.req.valid("param");
      const body = c.req.valid("json");
      const session = c.var.requestSession;
      const before = V1.savedLevel(await CharacterLevelsService.getLevel(session, id, levelId));
      const { abilityIncreases, feats, force, hp, powers, skills } = V1.levelEditRequest(before, body);
      await CharacterLevelsService.updateLevel(
        session,
        id,
        levelId,
        hp,
        abilityIncreases,
        skills,
        feats,
        powers,
        force,
      );
      return c.json(V1.savedLevel(await CharacterLevelsService.getLevel(session, id, levelId)), 200);
    },
  )
  .delete(
    "/:id/levels/latest",
    describeRoute({
      response: null,
      status: 204,
      summary: "Removes a character's latest level, with what it picked, and what its bonded creatures were with it",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await CharacterLevelsService.removeLevel(c.var.requestSession, id);
      return c.body(null, 204);
    },
  );
