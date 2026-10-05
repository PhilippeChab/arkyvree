import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { characterIdParam, limitDefaultingTo, page } from "@/server/routers/api/validation.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";

/** A number in the query string. */
const queryNumber = z.string().pipe(z.coerce.number());

const levelParams = z.object({ characterId: z.string().uuid(), characterLevelId: z.string().uuid() });

function isUuid(v: string) {
  return z.string().uuid().safeParse(v).success;
}

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

const levels = new Hono<SessionContext>()
  .get(
    "/:characterId/attribute-slots",
    zValidator("param", characterIdParam),
    zValidator(
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
    zValidator("param", characterIdParam),
    zValidator(
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
    zValidator("param", characterIdParam),
    zValidator(
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
      const query = c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getAvailableFeats(
          c.var.requestSession,
          characterId,
          query.aptitudeId,
          query.classId,
          query.level,
          {
            search: query.search,
            family: query.family,
            selectedFeatPicks: query.selectedFeatPicks,
            pendingLevelFeatPicks: query.pendingLevelFeatPicks,
          },
          { limit: query.limit, page: query.page },
          query.characterLevelId,
          query.pendingLevelClassLevelIds,
          query.pendingLevelAbilityIds,
        ),
        200,
      );
    },
  )
  .get(
    "/:characterId/available-feats/grouped",
    zValidator("param", characterIdParam),
    zValidator(
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
      const query = c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getAvailableFeatsGrouped(
          c.var.requestSession,
          characterId,
          query.aptitudeId,
          query.classId,
          query.level,
          {
            search: query.search,
            selectedFeatPicks: query.selectedFeatPicks,
            pendingLevelFeatPicks: query.pendingLevelFeatPicks,
          },
          { limit: query.limit, page: query.page },
          query.characterLevelId,
          query.pendingLevelClassLevelIds,
          query.pendingLevelAbilityIds,
        ),
        200,
      );
    },
  )
  .get(
    "/:characterId/available-powers",
    zValidator("param", characterIdParam),
    zValidator(
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
      const query = c.req.valid("query");
      return c.json(
        await CharacterLevelsService.getAvailablePowers(
          c.var.requestSession,
          characterId,
          query.aptitudeId,
          query.classId,
          query.level,
          {
            powerLevel: query.powerLevel,
            search: query.search,
            excludeSchools: query.excludeSchools,
            selectedFeatPicks: query.selectedFeatPicks,
            pendingLevelFeatPicks: query.pendingLevelFeatPicks,
          },
          { limit: query.limit, page: query.page },
          query.characterLevelId,
          query.pendingLevelClassLevelIds,
        ),
        200,
      );
    },
  )
  .get(
    "/:characterId/feat-slots",
    zValidator("param", characterIdParam),
    zValidator("query", z.object(levelQuery)),
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
    zValidator("param", characterIdParam),
    zValidator("query", z.object(levelQuery)),
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
    zValidator("param", characterIdParam),
    zValidator(
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
  .get("/:characterId/:characterLevelId", zValidator("param", levelParams), async (c) => {
    const { characterId, characterLevelId } = c.req.valid("param");
    return c.json(await CharacterLevelsService.getLevel(c.var.requestSession, characterId, characterLevelId), 200);
  })
  .post(
    "/:characterId/finalize",
    zValidator("param", characterIdParam),
    zValidator(
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
    zValidator("param", characterIdParam),
    zValidator(
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
    zValidator("param", levelParams),
    zValidator(
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
  .delete("/:characterId", zValidator("param", characterIdParam), async (c) => {
    const { characterId } = c.req.valid("param");
    return c.json(await CharacterLevelsService.removeLevel(c.var.requestSession, characterId), 200);
  });

export default levels;
