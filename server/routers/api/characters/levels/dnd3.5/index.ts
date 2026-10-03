import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { characterIdParam, limitOf, page } from "@/server/routers/api/validation.ts";
import { respond } from "@/server/routers/respond.ts";
import { CharacterLevelsService } from "@/server/services/characters/index.ts";

const isUuid = (v: string) => z.string().uuid().safeParse(v).success;

/** A number in the query string. */
const queryNumber = z.string().pipe(z.coerce.number());

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
  klassId: z.string().uuid(),
  level: queryNumber,
  characterLevelId: z.string().uuid().optional(),
  pendingLevelKlassLevelIds: idList,
};

const levelParams = z.object({ characterId: z.string().uuid(), characterLevelId: z.string().uuid() });

const levels = new Hono<SessionContext>()
  .get(
    "/:characterId/available-classes",
    zValidator("param", characterIdParam),
    zValidator(
      "query",
      z.object({
        limit: limitOf(10),
        page,
        search: z.string().optional(),
        pendingLevelKlassLevelIds: idList,
        pendingLevelAbilityIds: abilityIdList,
        pendingFeatPicks: featPicks,
        pendingSkillAllocations: skillAllocations,
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { limit, page, search, ...pending } = c.req.valid("query");
      const result = await CharacterLevelsService.initialize().call(
        "getAvailableKlasses",
        c.var.requestSession,
        characterId,
        { search },
        { limit, page },
        pending.pendingLevelKlassLevelIds,
        pending.pendingLevelAbilityIds,
        pending.pendingFeatPicks,
        pending.pendingSkillAllocations,
      );

      return respond(c, result, 200);
    },
  )
  .delete("/:characterId", zValidator("param", characterIdParam), async (c) => {
    const { characterId } = c.req.valid("param");
    const result = await CharacterLevelsService.initialize().call("removeLevel", c.var.requestSession, characterId);
    return respond(c, result, 200);
  })
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
      const result = await CharacterLevelsService.initialize().call(
        "getAttributeSlots",
        c.var.requestSession,
        characterId,
        characterLevelId,
        pendingLevelCount,
      );

      return respond(c, result, 200);
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
      const { klassId, level, characterLevelId, abilityId, pendingLevelKlassLevelIds, pendingLevelAbilityIds } =
        c.req.valid("query");
      const result = await CharacterLevelsService.initialize().call(
        "getSkillSlots",
        c.var.requestSession,
        characterId,
        klassId,
        level,
        characterLevelId,
        abilityId,
        pendingLevelKlassLevelIds,
        pendingLevelAbilityIds,
      );

      return respond(c, result, 200);
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
        limit: limitOf(20),
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
      const result = await CharacterLevelsService.initialize().call(
        "getAvailableFeats",
        c.var.requestSession,
        characterId,
        query.aptitudeId,
        query.klassId,
        query.level,
        {
          search: query.search,
          family: query.family,
          selectedFeatPicks: query.selectedFeatPicks,
          pendingLevelFeatPicks: query.pendingLevelFeatPicks,
        },
        { limit: query.limit, page: query.page },
        query.characterLevelId,
        query.pendingLevelKlassLevelIds,
        query.pendingLevelAbilityIds,
      );

      return respond(c, result, 200);
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
        limit: limitOf(20),
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
      const result = await CharacterLevelsService.initialize().call(
        "getAvailableFeatsGrouped",
        c.var.requestSession,
        characterId,
        query.aptitudeId,
        query.klassId,
        query.level,
        {
          search: query.search,
          selectedFeatPicks: query.selectedFeatPicks,
          pendingLevelFeatPicks: query.pendingLevelFeatPicks,
        },
        { limit: query.limit, page: query.page },
        query.characterLevelId,
        query.pendingLevelKlassLevelIds,
        query.pendingLevelAbilityIds,
      );

      return respond(c, result, 200);
    },
  )
  .get(
    "/:characterId/feat-slots",
    zValidator("param", characterIdParam),
    zValidator("query", z.object(levelQuery)),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { klassId, level, characterLevelId, pendingLevelKlassLevelIds } = c.req.valid("query");
      const service = CharacterLevelsService.initialize();
      const result = characterLevelId
        ? await service.call("getEditFeatSlots", c.var.requestSession, characterId, klassId, level, characterLevelId)
        : await service.call(
            "getFeatSlots",
            c.var.requestSession,
            characterId,
            klassId,
            level,
            pendingLevelKlassLevelIds,
          );

      return respond(c, result, 200);
    },
  )
  .get(
    "/:characterId/power-slots",
    zValidator("param", characterIdParam),
    zValidator("query", z.object(levelQuery)),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { klassId, level, characterLevelId, pendingLevelKlassLevelIds } = c.req.valid("query");
      const service = CharacterLevelsService.initialize();
      const result = characterLevelId
        ? await service.call("getEditPowerSlots", c.var.requestSession, characterId, klassId, level, characterLevelId)
        : await service.call(
            "getPowerSlots",
            c.var.requestSession,
            characterId,
            klassId,
            level,
            pendingLevelKlassLevelIds,
          );

      return respond(c, result, 200);
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
        limit: limitOf(20),
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
      const result = await CharacterLevelsService.initialize().call(
        "getAvailablePowers",
        c.var.requestSession,
        characterId,
        query.aptitudeId,
        query.klassId,
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
        query.pendingLevelKlassLevelIds,
      );

      return respond(c, result, 200);
    },
  )
  .get("/:characterId/:characterLevelId", zValidator("param", levelParams), async (c) => {
    const { characterId, characterLevelId } = c.req.valid("param");
    const result = await CharacterLevelsService.initialize().call(
      "getLevel",
      c.var.requestSession,
      characterId,
      characterLevelId,
    );

    return respond(c, result, 200);
  })
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
      const result = await CharacterLevelsService.initialize().call(
        "updateLevel",
        c.var.requestSession,
        characterId,
        characterLevelId,
        hp,
        abilityId,
        skills,
        feats,
        powers,
        force,
      );

      return respond(c, result, 200);
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
      const result = await CharacterLevelsService.initialize().call(
        "getLevelUpPreview",
        c.var.requestSession,
        characterId,
        levels,
        abilityIds,
      );

      return respond(c, result, 200);
    },
  )
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
      const result = await CharacterLevelsService.initialize().call(
        "finalizeLevelUp",
        c.var.requestSession,
        characterId,
        levels,
        skills,
        feats,
        powers,
        force,
      );

      return respond(c, result, 200);
    },
  );

export default levels;
