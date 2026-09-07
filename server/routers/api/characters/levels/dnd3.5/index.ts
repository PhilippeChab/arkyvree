import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/index.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

const isUuid = (v: string) => z.string().uuid().safeParse(v).success;

/** Parses `featId:aptitudeId,featId:aptitudeId,…` query params into `{ featId, aptitudeId }` pairs. */
function parseFeatPicks(value: string | undefined) {
  if (!value) return undefined;
  return value
    .split(",")
    .map((pair) => {
      const [featId, aptitudeId] = pair.split(":");
      return { featId, aptitudeId };
    })
    .filter((p) => isUuid(p.featId) && isUuid(p.aptitudeId));
}

const levels = new Hono<SessionContext>()
  .get(
    "/:characterId/available-classes",
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        limit: z.string().pipe(z.coerce.number()).optional(),
        page: z.string().pipe(z.coerce.number()).optional(),
        search: z.string().optional(),
        pendingLevelKlassLevelIds: z.string().optional(),
        pendingLevelAbilityIds: z.string().optional(),
        pendingFeatPicks: z.string().optional(),
        pendingSkillAllocations: z.string().optional(),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { limit = 10, page = 1, search, pendingLevelKlassLevelIds, pendingLevelAbilityIds, pendingFeatPicks, pendingSkillAllocations } = c.req.valid("query");

      const parsedPendingKlassLevelIds = pendingLevelKlassLevelIds?.split(",").filter(isUuid);
      const parsedPendingAbilityIds = pendingLevelAbilityIds?.split(",").map((id) => id === "null" || !isUuid(id) ? undefined : id);
      const parsedPendingFeatPicks = parseFeatPicks(pendingFeatPicks);
      const parsedPendingSkillAllocations = pendingSkillAllocations?.split(",").map((pair) => {
        const [skillId, rank] = pair.split(":");
        return { skillId, rank: Number(rank) };
      }).filter((a) => isUuid(a.skillId) && !isNaN(a.rank));

      const result = await CharacterLevelsService.initialize().call(
        "getAvailableKlasses",
        c.var.requestSession,
        characterId,
        { search },
        { limit, page },
        parsedPendingKlassLevelIds,
        parsedPendingAbilityIds,
        parsedPendingFeatPicks,
        parsedPendingSkillAllocations,
      );

      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .delete(
    "/:characterId",
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const result = await CharacterLevelsService.initialize().call(
        "removeLevel",
        c.var.requestSession,
        characterId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:characterId/attribute-slots",
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        characterLevelId: z.string().uuid().optional(),
        pendingLevelCount: z.string().pipe(z.coerce.number()).optional(),
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

      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:characterId/skill-slots",
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        klassId: z.string().uuid(),
        level: z.string().pipe(z.coerce.number()),
        characterLevelId: z.string().uuid().optional(),
        abilityId: z.string().uuid().optional(),
        pendingLevelKlassLevelIds: z.string().optional(),
        pendingLevelAbilityIds: z.string().optional(),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { klassId, level, characterLevelId, abilityId, pendingLevelKlassLevelIds, pendingLevelAbilityIds } = c.req.valid("query");
      const parsedPendingKlassLevelIds = pendingLevelKlassLevelIds?.split(",").filter((id) => z.string().uuid().safeParse(id).success);
      const parsedPendingAbilityIds = pendingLevelAbilityIds?.split(",").map((id) => id || undefined);
      const result = await CharacterLevelsService.initialize().call(
        "getSkillSlots",
        c.var.requestSession,
        characterId,
        klassId,
        level,
        characterLevelId,
        abilityId,
        parsedPendingKlassLevelIds,
        parsedPendingAbilityIds,
      );

      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:characterId/available-feats",
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        aptitudeId: z.string().uuid(),
        klassId: z.string().uuid(),
        level: z.string().pipe(z.coerce.number()),
        limit: z.string().pipe(z.coerce.number()).optional(),
        page: z.string().pipe(z.coerce.number()).optional(),
        search: z.string().optional(),
        family: z.string().optional(),
        selectedFeatPicks: z.string().optional(),
        pendingLevelFeatPicks: z.string().optional(),
        pendingLevelKlassLevelIds: z.string().optional(),
        pendingLevelAbilityIds: z.string().optional(),
        characterLevelId: z.string().uuid().optional(),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { aptitudeId, klassId, level, limit = 20, page = 1, search, family, selectedFeatPicks, pendingLevelFeatPicks, pendingLevelKlassLevelIds, pendingLevelAbilityIds, characterLevelId } = c.req.valid("query");
      const parsedPendingKlassLevelIds = pendingLevelKlassLevelIds?.split(",").filter(isUuid);
      const parsedPendingLevelFeatPicks = parseFeatPicks(pendingLevelFeatPicks);
      const parsedPendingAbilityIds = pendingLevelAbilityIds?.split(",").map((id) => id === "null" || !isUuid(id) ? undefined : id);
      const result = await CharacterLevelsService.initialize().call(
        "getAvailableFeats",
        c.var.requestSession,
        characterId,
        aptitudeId,
        klassId,
        level,
        { search, family, selectedFeatPicks: parseFeatPicks(selectedFeatPicks), pendingLevelFeatPicks: parsedPendingLevelFeatPicks },
        { limit, page },
        characterLevelId,
        parsedPendingKlassLevelIds,
        parsedPendingAbilityIds,
      );

      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:characterId/available-feats/grouped",
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        aptitudeId: z.string().uuid(),
        klassId: z.string().uuid(),
        level: z.string().pipe(z.coerce.number()),
        limit: z.string().pipe(z.coerce.number()).optional(),
        page: z.string().pipe(z.coerce.number()).optional(),
        search: z.string().optional(),
        selectedFeatPicks: z.string().optional(),
        pendingLevelFeatPicks: z.string().optional(),
        pendingLevelKlassLevelIds: z.string().optional(),
        pendingLevelAbilityIds: z.string().optional(),
        characterLevelId: z.string().uuid().optional(),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { aptitudeId, klassId, level, limit = 20, page = 1, search, selectedFeatPicks, pendingLevelFeatPicks, pendingLevelKlassLevelIds, pendingLevelAbilityIds, characterLevelId } = c.req.valid("query");
      const parsedPendingKlassLevelIds = pendingLevelKlassLevelIds?.split(",").filter(isUuid);
      const parsedPendingLevelFeatPicks = parseFeatPicks(pendingLevelFeatPicks);
      const parsedPendingAbilityIds = pendingLevelAbilityIds?.split(",").map((id) => id === "null" || !isUuid(id) ? undefined : id);
      const result = await CharacterLevelsService.initialize().call(
        "getAvailableFeatsGrouped",
        c.var.requestSession,
        characterId,
        aptitudeId,
        klassId,
        level,
        { search, selectedFeatPicks: parseFeatPicks(selectedFeatPicks), pendingLevelFeatPicks: parsedPendingLevelFeatPicks },
        { limit, page },
        characterLevelId,
        parsedPendingKlassLevelIds,
        parsedPendingAbilityIds,
      );

      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:characterId/feat-slots",
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        klassId: z.string().uuid(),
        level: z.string().pipe(z.coerce.number()),
        characterLevelId: z.string().uuid().optional(),
        pendingLevelKlassLevelIds: z.string().optional(),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { klassId, level, characterLevelId, pendingLevelKlassLevelIds } = c.req.valid("query");
      const parsedPendingKlassLevelIds = pendingLevelKlassLevelIds?.split(",").filter((id) => z.string().uuid().safeParse(id).success);
      const service = CharacterLevelsService.initialize();
      const result = characterLevelId
        ? await service.call("getEditFeatSlots", c.var.requestSession, characterId, klassId, level, characterLevelId)
        : await service.call("getFeatSlots", c.var.requestSession, characterId, klassId, level, parsedPendingKlassLevelIds);

      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:characterId/power-slots",
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        klassId: z.string().uuid(),
        level: z.string().pipe(z.coerce.number()),
        characterLevelId: z.string().uuid().optional(),
        pendingLevelKlassLevelIds: z.string().optional(),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { klassId, level, characterLevelId, pendingLevelKlassLevelIds } = c.req.valid("query");
      const parsedPendingKlassLevelIds = pendingLevelKlassLevelIds?.split(",").filter((id) => z.string().uuid().safeParse(id).success);
      const service = CharacterLevelsService.initialize();
      const result = characterLevelId
        ? await service.call("getEditPowerSlots", c.var.requestSession, characterId, klassId, level, characterLevelId)
        : await service.call("getPowerSlots", c.var.requestSession, characterId, klassId, level, parsedPendingKlassLevelIds);

      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:characterId/available-powers",
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        aptitudeId: z.string().uuid(),
        klassId: z.string().uuid(),
        level: z.string().pipe(z.coerce.number()),
        powerLevel: z.string().pipe(z.coerce.number()).optional(),
        limit: z.string().pipe(z.coerce.number()).optional(),
        page: z.string().pipe(z.coerce.number()).optional(),
        search: z.string().optional(),
        excludeSchools: z.string().optional(),
        selectedFeatPicks: z.string().optional(),
        pendingLevelFeatPicks: z.string().optional(),
        pendingLevelKlassLevelIds: z.string().optional(),
        characterLevelId: z.string().uuid().optional(),
      }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { aptitudeId, klassId, level, powerLevel, limit = 20, page = 1, search, excludeSchools, selectedFeatPicks, pendingLevelFeatPicks, pendingLevelKlassLevelIds, characterLevelId } = c.req.valid("query");
      const parsedPendingKlassLevelIds = pendingLevelKlassLevelIds?.split(",").filter(isUuid);
      const parsedPendingLevelFeatPicks = parseFeatPicks(pendingLevelFeatPicks);
      const result = await CharacterLevelsService.initialize().call(
        "getAvailablePowers",
        c.var.requestSession,
        characterId,
        aptitudeId,
        klassId,
        level,
        { powerLevel, search, excludeSchools: excludeSchools ? excludeSchools.split(",") : undefined, selectedFeatPicks: parseFeatPicks(selectedFeatPicks), pendingLevelFeatPicks: parsedPendingLevelFeatPicks },
        { limit, page },
        characterLevelId,
        parsedPendingKlassLevelIds,
      );

      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:characterId/:characterLevelId",
    zValidator("param", z.object({
      characterId: z.string().uuid(),
      characterLevelId: z.string().uuid(),
    })),
    async (c) => {
      const { characterId, characterLevelId } = c.req.valid("param");
      const result = await CharacterLevelsService.initialize().call(
        "getLevel",
        c.var.requestSession,
        characterId,
        characterLevelId,
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
    "/:characterId/:characterLevelId",
    zValidator("param", z.object({
      characterId: z.string().uuid(),
      characterLevelId: z.string().uuid(),
    })),
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

      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:characterId/preview",
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        levels: z.array(z.object({
          klassId: z.string().uuid(),
          level: z.number().int().min(1),
        })).min(1).max(20),
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

      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:characterId/finalize",
    zValidator("param", z.object({ characterId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        levels: z.array(z.object({
          klassId: z.string().uuid(),
          level: z.number().int().min(1),
          hp: z.number().int().min(1),
          abilityId: z.string().uuid().nullable(),
        })).min(1).max(20),
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

      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );

export default levels;
