import { Hono } from "hono";
import { z } from "zod";

import { validate } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { isUuid, limitDefaultingTo } from "@/server/routers/api/schemaBuilders.ts";
import { characterIdParam, page } from "@/server/routers/api/validation.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";

/** A number in the query string. */
const queryNumber = z.string().pipe(z.coerce.number());

const levelParams = characterIdParam.extend({ characterLevelId: z.string().uuid() });

/** Comma-separated ids: what isn't one is dropped. */
const idList = z
  .string()
  .optional()
  .transform((value) => value?.split(",").filter(isUuid));

/** Comma-separated, one per pending level: its ability increase's id, or anything else (`null`) for none. */
const abilityIdList = z
  .string()
  .optional()
  .transform((value) => value?.split(",").map((id) => (isUuid(id) ? id : undefined)));

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

/** Comma-separated `skillId:rank` allocations: what isn't one is dropped. */
const skillAllocations = z
  .string()
  .optional()
  .transform((value) =>
    value
      ?.split(",")
      .map((pair) => {
        const [skillId, rank] = pair.split(":");
        return { skillId, rank: Number(rank) };
      })
      .filter((allocation) => isUuid(allocation.skillId) && !isNaN(allocation.rank)),
  );

/** The class level a level-up step is for, and the levels planned before it. */
const levelQuery = {
  classId: z.string().uuid(),
  level: queryNumber,
  characterLevelId: z.string().uuid().optional(),
  pendingLevelClassLevelIds: idList,
};

export default new Hono<SessionContext>()
  .get(
    "/:characterId/attribute-slots",
    validate("param", characterIdParam),
    validate(
      "query",
      z.object({
        characterLevelId: z.string().uuid().optional(),
        pendingLevelCount: queryNumber.optional(),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { characterLevelId, pendingLevelCount } = c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getAttributeSlots(
          c.var.requestSession,
          characterId,
          characterLevelId,
          pendingLevelCount,
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
        limit: limitDefaultingTo(10),
        page,
        search: z.string().optional(),
        pendingLevelClassLevelIds: idList,
        pendingLevelAbilityIds: abilityIdList,
        pendingFeatPicks: featPicks,
        pendingSkillAllocations: skillAllocations,
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { limit, page, search, ...pending } = c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getAvailableKlasses(
          c.var.requestSession,
          characterId,
          { search },
          { limit, page },
          pending.pendingLevelClassLevelIds,
          pending.pendingLevelAbilityIds,
          pending.pendingFeatPicks,
          pending.pendingSkillAllocations,
        ),
        200,
      );
    },
  )
  .get(
    "/:characterId/available-feats",
    validate("param", characterIdParam),
    validate(
      "query",
      z.object({
        ...levelQuery,
        aptitudeId: z.string().uuid(),
        limit: limitDefaultingTo(20),
        page,
        search: z.string().optional(),
        family: z.string().optional(),
        selectedFeatPicks: featPicks,
        pendingLevelFeatPicks: featPicks,
        pendingLevelAbilityIds: abilityIdList,
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const {
        aptitudeId,
        classId,
        level,
        search,
        family,
        selectedFeatPicks,
        pendingLevelFeatPicks,
        limit,
        page,
        characterLevelId,
        pendingLevelClassLevelIds,
        pendingLevelAbilityIds,
      } = c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getAvailableFeats(
          c.var.requestSession,
          characterId,
          aptitudeId,
          classId,
          level,
          {
            search,
            family,
            selectedFeatPicks,
            pendingLevelFeatPicks,
          },
          { limit, page },
          characterLevelId,
          pendingLevelClassLevelIds,
          pendingLevelAbilityIds,
        ),
        200,
      );
    },
  )
  .get(
    "/:characterId/available-feats/grouped",
    validate("param", characterIdParam),
    validate(
      "query",
      z.object({
        ...levelQuery,
        aptitudeId: z.string().uuid(),
        limit: limitDefaultingTo(20),
        page,
        search: z.string().optional(),
        selectedFeatPicks: featPicks,
        pendingLevelFeatPicks: featPicks,
        pendingLevelAbilityIds: abilityIdList,
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const {
        aptitudeId,
        classId,
        level,
        search,
        selectedFeatPicks,
        pendingLevelFeatPicks,
        limit,
        page,
        characterLevelId,
        pendingLevelClassLevelIds,
        pendingLevelAbilityIds,
      } = c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getAvailableFeatsGrouped(
          c.var.requestSession,
          characterId,
          aptitudeId,
          classId,
          level,
          {
            search,
            selectedFeatPicks,
            pendingLevelFeatPicks,
          },
          { limit, page },
          characterLevelId,
          pendingLevelClassLevelIds,
          pendingLevelAbilityIds,
        ),
        200,
      );
    },
  )
  .get(
    "/:characterId/available-powers",
    validate("param", characterIdParam),
    validate(
      "query",
      z.object({
        ...levelQuery,
        aptitudeId: z.string().uuid(),
        powerLevel: queryNumber.optional(),
        limit: limitDefaultingTo(20),
        page,
        search: z.string().optional(),
        excludeSchools: z
          .string()
          .optional()
          .transform((value) => (value ? value.split(",") : undefined)),
        selectedFeatPicks: featPicks,
        pendingLevelFeatPicks: featPicks,
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const {
        aptitudeId,
        classId,
        level,
        powerLevel,
        search,
        excludeSchools,
        selectedFeatPicks,
        pendingLevelFeatPicks,
        limit,
        page,
        characterLevelId,
        pendingLevelClassLevelIds,
      } = c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getAvailablePowers(
          c.var.requestSession,
          characterId,
          aptitudeId,
          classId,
          level,
          {
            powerLevel,
            search,
            excludeSchools,
            selectedFeatPicks,
            pendingLevelFeatPicks,
          },
          { limit, page },
          characterLevelId,
          pendingLevelClassLevelIds,
        ),
        200,
      );
    },
  )
  .get(
    "/:characterId/feat-slots",
    validate("param", characterIdParam),
    validate("query", z.object(levelQuery)),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { classId, level, characterLevelId, pendingLevelClassLevelIds } = c.req.valid("query");
      const result = characterLevelId
        ? await CharacterLevelsService.getEditFeatSlots(
            c.var.requestSession,
            characterId,
            classId,
            level,
            characterLevelId,
          )
        : await CharacterLevelsService.getFeatSlots(
            c.var.requestSession,
            characterId,
            classId,
            level,
            pendingLevelClassLevelIds,
          );

      return c.json(result, 200);
    },
  )
  .get(
    "/:characterId/power-slots",
    validate("param", characterIdParam),
    validate("query", z.object(levelQuery)),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { classId, level, characterLevelId, pendingLevelClassLevelIds } = c.req.valid("query");
      const result = characterLevelId
        ? await CharacterLevelsService.getEditPowerSlots(
            c.var.requestSession,
            characterId,
            classId,
            level,
            characterLevelId,
          )
        : await CharacterLevelsService.getPowerSlots(
            c.var.requestSession,
            characterId,
            classId,
            level,
            pendingLevelClassLevelIds,
          );

      return c.json(result, 200);
    },
  )
  .get(
    "/:characterId/skill-slots",
    validate("param", characterIdParam),
    validate(
      "query",
      z.object({
        ...levelQuery,
        abilityId: z.string().uuid().optional(),
        pendingLevelAbilityIds: abilityIdList,
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { classId, level, characterLevelId, abilityId, pendingLevelClassLevelIds, pendingLevelAbilityIds } =
        c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getSkillSlots(
          c.var.requestSession,
          characterId,
          classId,
          level,
          characterLevelId,
          abilityId,
          pendingLevelClassLevelIds,
          pendingLevelAbilityIds,
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
              level: z.number().int().min(1),
              hp: z.number().int().min(1),
              abilityId: z.string().uuid().nullable(),
            }),
          )
          .min(1)
          .max(20),
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
              level: z.number().int().min(1),
            }),
          )
          .min(1)
          .max(20),
        abilityIds: z.array(z.string().uuid().nullable()),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { levels, abilityIds } = c.req.valid("json");
      return c.json(
        await CharacterLevelsService.getLevelUpPreview(c.var.requestSession, characterId, levels, abilityIds),
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
        hp: z.number().int().min(1),
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
