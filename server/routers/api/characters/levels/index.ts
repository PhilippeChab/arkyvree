import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { buildPickPairsSchema, isUuid, limitDefaultingTo } from "@/server/routers/api/schemaBuilders.ts";
import { characterIdParam, page } from "@/server/routers/api/validation.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";

/** A class's level, as a level-up plans it: its ruleset bounds it. */
const classLevel = z.number().int().min(1);

/** Comma-separated `featId:aptitudeId` picks: what isn't one is dropped. */
const featPicks = buildPickPairsSchema("featId");

/** Comma-separated ids: what isn't one is dropped. */
const idList = z
  .string()
  .optional()
  .transform((value) => value?.split(",").filter(isUuid));

/**
 * A level's ability increases in the query string: `abilityId:amount` pairs joined by `;`, what isn't one dropped (an
 * empty string is none).
 */
const increaseList = z.string().transform((value) =>
  value
    .split(";")
    .map((pair) => pair.split(":"))
    .filter(([abilityId, amount]) => isUuid(abilityId) && /^[1-9]\d*$/.test(amount ?? ""))
    .map(([abilityId, amount]) => ({ abilityId, amount: Number(amount) })),
);

/** The hit points a character's level gives. */
const levelHp = z.number().int().min(1);

/** A level's ability increases, as a body sends them: each an ability, and the amount it's raised by. */
const levelIncreases = z.array(z.object({ abilityId: z.string().uuid(), amount: z.number().int().min(1) }));

const levelParams = characterIdParam.extend({ characterLevelId: z.string().uuid() });

/** Comma-separated `powerId:aptitudeId` picks: what isn't one is dropped. */
const powerPicks = buildPickPairsSchema("powerId");

/** A number in the query string. */
const queryNumber = z.string().pipe(z.coerce.number());

/** Comma-separated, one per planned level: its ability increases (`increaseList`). */
const plannedIncreaseList = z
  .string()
  .optional()
  .transform((value) => value?.split(",").map((level) => increaseList.parse(level)));

/** Comma-separated `skillId:points` points spent on each skill: what isn't one is dropped. */
const skillPoints = z
  .string()
  .optional()
  .transform((value) =>
    value === undefined
      ? undefined
      : Object.fromEntries(
          value
            .split(",")
            .map((pair) => pair.split(":"))
            .filter(([skillId, points]) => isUuid(skillId) && !isNaN(Number(points)))
            .map(([skillId, points]) => [skillId, Number(points)]),
        ),
  );

/**
 * The level a step is for: class `classId`'s `level` (which a step that reads its class requires) with its ability
 * increases, after the levels the wizard plans before it (`plannedClassLevelIds`, with their ability increases), or a
 * saved level's edit (`editedLevelId`), and the skill points spent at it so far (`skillPoints`).
 */
const stepQuery = {
  abilityIncreases: increaseList.optional(),
  classId: z.string().uuid().optional(),
  editedLevelId: z.string().uuid().optional(),
  level: queryNumber.optional(),
  plannedAbilityIncreases: plannedIncreaseList,
  plannedClassLevelIds: idList,
  skillPoints,
};

/**
 * A feat or power picker's page: its step's level, which it requires, the pool it picks in and the feats and powers
 * picked so far, which its options are checked against and what they give it leaves out, and the levels the wizard
 * plans after it (`laterClassLevelIds`), whose grants it leaves out.
 */
const pickerQuery = {
  ...stepQuery,
  aptitudeId: z.string().uuid(),
  classId: z.string().uuid(),
  featPicks,
  laterClassLevelIds: idList,
  level: queryNumber,
  limit: limitDefaultingTo(20),
  page,
  powerPicks,
  search: z.string().optional(),
};

/** A step's name, as its ruleset lists it. */
const stepParams = characterIdParam.extend({ step: z.string().min(1) });

export default new Hono<SessionContext>()
  .get(
    "/:characterId/available-classes",
    validate("param", characterIdParam),
    validate(
      "query",
      z.object({
        featPicks,
        limit: limitDefaultingTo(10),
        page,
        plannedAbilityIncreases: plannedIncreaseList,
        plannedClassLevelIds: idList,
        search: z.string().optional(),
        skillPoints,
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { limit, page, ...where } = c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getAvailableClasses(c.var.requestSession, characterId, where, { limit, page }),
        200,
      );
    },
  )
  .get(
    "/:characterId/available-feats",
    validate("param", characterIdParam),
    validate("query", z.object({ ...pickerQuery, family: z.string().optional() })),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { limit, page, ...where } = c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getAvailableFeats(c.var.requestSession, characterId, where, { limit, page }),
        200,
      );
    },
  )
  .get(
    "/:characterId/available-feats/grouped",
    validate("param", characterIdParam),
    validate("query", z.object(pickerQuery)),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { limit, page, ...where } = c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getAvailableFeatGroups(c.var.requestSession, characterId, where, { limit, page }),
        200,
      );
    },
  )
  .get(
    "/:characterId/available-powers",
    validate("param", characterIdParam),
    validate("query", z.object({ ...pickerQuery, powerLevel: queryNumber.optional() })),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { limit, page, ...where } = c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getAvailablePowers(c.var.requestSession, characterId, where, { limit, page }),
        200,
      );
    },
  )
  .get(
    "/:characterId/level-steps",
    validate("param", characterIdParam),
    validate("query", z.object(stepQuery)),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const query = c.req.valid("query");
      return c.json(await CharacterLevelsService.getSteps(c.var.requestSession, characterId, query), 200);
    },
  )
  .get(
    "/:characterId/level-steps/:step",
    validate("param", stepParams),
    validate("query", z.object({ ...stepQuery, featPicks, powerPicks })),
    async (c) => {
      const { characterId, step } = c.req.valid("param");
      const query = c.req.valid("query");
      return c.json(await CharacterLevelsService.getStep(c.var.requestSession, characterId, step, query), 200);
    },
  )
  .get("/:characterId/:characterLevelId", validate("param", levelParams), async (c) => {
    const { characterId, characterLevelId } = c.req.valid("param");
    return c.json(await CharacterLevelsService.getLevel(c.var.requestSession, characterId, characterLevelId), 200);
  })
  .post(
    "/:characterId/finalize",
    validate("param", characterIdParam),
    validate(
      "json",
      z.object({
        levels: z
          .array(
            z.object({
              klassId: z.string().uuid(),
              level: classLevel,
              hp: levelHp,
              abilityIncreases: levelIncreases,
            }),
          )
          .min(1),
        skills: z.record(z.string().uuid(), z.number().int().min(0)),
        feats: z.record(z.string().uuid(), z.array(z.string().uuid())),
        powers: z.record(z.string().uuid(), z.array(z.string().uuid())),
        force: z.boolean().default(false),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { levels, skills, feats, powers, force } = c.req.valid("json");
      return c.json(
        await CharacterLevelsService.finalizeLevelUp(
          c.var.requestSession,
          characterId,
          levels,
          skills,
          feats,
          powers,
          force,
        ),
        200,
      );
    },
  )
  .post(
    "/:characterId/preview",
    validate("param", characterIdParam),
    validate(
      "json",
      z.object({
        levels: z
          .array(
            z.object({
              klassId: z.string().uuid(),
              level: classLevel,
              abilityIncreases: levelIncreases.default([]),
            }),
          )
          .min(1),
        skills: z.record(z.string().uuid(), z.number().int().min(0)).default({}),
        feats: z.record(z.string().uuid(), z.array(z.string().uuid())).default({}),
        powers: z.record(z.string().uuid(), z.array(z.string().uuid())).default({}),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { levels, skills, feats, powers } = c.req.valid("json");
      return c.json(
        await CharacterLevelsService.getPreview(c.var.requestSession, characterId, levels, skills, feats, powers),
        200,
      );
    },
  )
  .put(
    "/:characterId/:characterLevelId",
    validate("param", levelParams),
    validate(
      "json",
      z.object({
        hp: levelHp,
        abilityIncreases: levelIncreases,
        skills: z.record(z.string().uuid(), z.number().int().min(0)),
        feats: z.record(z.string().uuid(), z.array(z.string().uuid())),
        powers: z.record(z.string().uuid(), z.array(z.string().uuid())),
        force: z.boolean().default(false),
      }),
    ),
    async (c) => {
      const { characterId, characterLevelId } = c.req.valid("param");
      const { hp, abilityIncreases, skills, feats, powers, force } = c.req.valid("json");
      return c.json(
        await CharacterLevelsService.updateLevel(
          c.var.requestSession,
          characterId,
          characterLevelId,
          hp,
          abilityIncreases,
          skills,
          feats,
          powers,
          force,
        ),
        200,
      );
    },
  )
  .delete("/:characterId", validate("param", characterIdParam), async (c) => {
    const { characterId } = c.req.valid("param");
    return c.json(await CharacterLevelsService.removeLevel(c.var.requestSession, characterId), 200);
  });
