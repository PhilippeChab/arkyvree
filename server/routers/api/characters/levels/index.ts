import { Hono } from "hono";
import { z } from "zod";

import { RULESET_LIMITS } from "@/engine/index.ts";
import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { isUuid, limitDefaultingTo } from "@/server/routers/api/schemaBuilders.ts";
import { characterIdParam, page } from "@/server/routers/api/validation.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";

/** Comma-separated, one per planned level: its ability increase's id, or anything else (`null`) for none. */
const abilityIdList = z
  .string()
  .optional()
  .transform((value) => value?.split(",").map((id) => (isUuid(id) ? id : undefined)));

/** A class's level, as a level-up plans it. */
const classLevel = z.number().int().min(1).max(RULESET_LIMITS.classLevel);

/** Comma-separated `featId:aptitudeId` picks: what isn't one is dropped. */
const featPicks = z
  .string()
  .optional()
  .transform((value) =>
    value
      ?.split(",")
      .map((pair) => {
        const [featId, aptitudeId] = pair.split(":");
        return { featId, aptitudeId };
      })
      .filter((pick) => isUuid(pick.featId) && isUuid(pick.aptitudeId)),
  );

/** Comma-separated ids: what isn't one is dropped. */
const idList = z
  .string()
  .optional()
  .transform((value) => value?.split(",").filter(isUuid));

/** The hit points a character's level gives. */
const levelHp = z.number().int().min(1);

const levelParams = characterIdParam.extend({ characterLevelId: z.string().uuid() });

/** A number in the query string. */
const queryNumber = z.string().pipe(z.coerce.number());

/**
 * The level a step is for: class `classId`'s `level`, after the levels the wizard plans before it
 * (`plannedClassLevelIds`), or a saved level's edit (`editedLevelId`).
 */
const stepQuery = {
  classId: z.string().uuid(),
  level: queryNumber,
  editedLevelId: z.string().uuid().optional(),
  plannedClassLevelIds: idList,
};

/**
 * A feat or power picker's page: its step's level, the pool it picks in, the planned levels' ability increases and the
 * feats picked so far, which its options are checked against.
 */
const pickerQuery = {
  ...stepQuery,
  aptitudeId: z.string().uuid(),
  featPicks,
  limit: limitDefaultingTo(20),
  page,
  plannedAbilityIds: abilityIdList,
  search: z.string().optional(),
};

/** Comma-separated `skillId:rank` ranks: what isn't one is dropped. */
const skillRanks = z
  .string()
  .optional()
  .transform((value) =>
    value
      ?.split(",")
      .map((pair) => {
        const [skillId, rank] = pair.split(":");
        return { skillId, rank: Number(rank) };
      })
      .filter((ranked) => isUuid(ranked.skillId) && !isNaN(ranked.rank)),
  );

export default new Hono<SessionContext>()
  .get(
    "/:characterId/ability-step",
    validate("param", characterIdParam),
    validate(
      "query",
      z.object({
        editedLevelId: z.string().uuid().optional(),
        plannedLevelCount: queryNumber.optional(),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { editedLevelId, plannedLevelCount } = c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getAbilityStep(
          c.var.requestSession,
          characterId,
          editedLevelId,
          plannedLevelCount,
        ),
        200,
      );
    },
  )
  .get(
    "/:characterId/available-classes",
    validate("param", characterIdParam),
    validate(
      "query",
      z.object({
        featPicks,
        limit: limitDefaultingTo(10),
        page,
        plannedAbilityIds: abilityIdList,
        plannedClassLevelIds: idList,
        search: z.string().optional(),
        skillRanks,
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
    validate("query", z.object({ ...pickerQuery, powerLevel: queryNumber.optional(), selectedPowerIds: idList })),
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
    "/:characterId/feat-step",
    validate("param", characterIdParam),
    validate("query", z.object(stepQuery)),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { classId, level, editedLevelId, plannedClassLevelIds } = c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getFeatStep(
          c.var.requestSession,
          characterId,
          classId,
          level,
          editedLevelId,
          plannedClassLevelIds,
        ),
        200,
      );
    },
  )
  .get(
    "/:characterId/power-step",
    validate("param", characterIdParam),
    validate("query", z.object(stepQuery)),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { classId, level, editedLevelId, plannedClassLevelIds } = c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getPowerStep(
          c.var.requestSession,
          characterId,
          classId,
          level,
          editedLevelId,
          plannedClassLevelIds,
        ),
        200,
      );
    },
  )
  .get(
    "/:characterId/skill-step",
    validate("param", characterIdParam),
    validate(
      "query",
      z.object({
        ...stepQuery,
        abilityId: z.string().uuid().optional(),
        plannedAbilityIds: abilityIdList,
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { classId, level, abilityId, editedLevelId, plannedClassLevelIds, plannedAbilityIds } =
        c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getSkillStep(
          c.var.requestSession,
          characterId,
          classId,
          level,
          abilityId,
          editedLevelId,
          plannedClassLevelIds,
          plannedAbilityIds,
        ),
        200,
      );
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
              abilityId: z.string().uuid().nullable(),
            }),
          )
          .min(1)
          .max(RULESET_LIMITS.characterLevel),
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
            }),
          )
          .min(1)
          .max(RULESET_LIMITS.characterLevel),
        abilityIds: z.array(z.string().uuid().nullable()),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { levels, abilityIds } = c.req.valid("json");
      return c.json(
        await CharacterLevelsService.getPreview(c.var.requestSession, characterId, levels, abilityIds),
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
        abilityId: z.string().uuid().nullable(),
        skills: z.record(z.string().uuid(), z.number().int().min(0)),
        feats: z.record(z.string().uuid(), z.array(z.string().uuid())),
        powers: z.record(z.string().uuid(), z.array(z.string().uuid())),
        force: z.boolean().default(false),
      }),
    ),
    async (c) => {
      const { characterId, characterLevelId } = c.req.valid("param");
      const { hp, abilityId, skills, feats, powers, force } = c.req.valid("json");
      return c.json(
        await CharacterLevelsService.updateLevel(
          c.var.requestSession,
          characterId,
          characterLevelId,
          hp,
          abilityId,
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
