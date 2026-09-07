import { klassLevelsInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset, type CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  KlassLevelFeats,
  KlassLevels,
  KlassLevelSaves,
  Properties,
  Requirements,
} from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import BaseService from "@/server/services/BaseService.ts";
import { createActivityWithNotifications } from "@/server/services/activityNotifications.ts";
import { cowEntity, cowEntityForCustomization, deleteModifiersWithCascade, deletePropertiesWithCascade, deleteRequirementsWithCascade, entityHasCharacterPicks, withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import { PowersMethods } from "@/server/services/rulesets/PowersService.ts";
import type { BaseRules } from "@/shared/enums.ts";
import type { KlassLevel, KlassLevelFeat, Modifier, Property, Session } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/utils.ts";
import { getTableName } from "drizzle-orm";

function verifyKlassLineage(klass: { rulesetId: string } | undefined, rulesetId: string, ancestorRulesetIds: string[]): asserts klass is { rulesetId: string } {
  if (!klass || (klass.rulesetId !== rulesetId && !ancestorRulesetIds.includes(klass.rulesetId))) {
    throw new NotFoundError("Class not found in this ruleset");
  }
}

async function listClassLevels(rulesetId: string, classId: string) {
  return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
    const { sourceChain } = rulesetData.cow;
    const klass = rulesetData.klassesById.get(classId);
    verifyKlassLineage(klass, rulesetId, sourceChain);

    const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
    const levels = rulesetData.klassLevelsByKlassId.get(klass.id) ?? [];

    const levelProperties: Property[] = [];
    for (const level of levels) {
      const ps = rulesetData.propertiesByEntity.get(level.id);
      if (ps) levelProperties.push(...ps);
    }

    const enrichedLevels = levels.map((level) => {
      const levelFeats = rulesetData.klassLevelFeatsByKlassLevel.get(level.id) ?? [];
      const levelFeatsData = levelFeats.map((lf) => {
        const feat = rulesetData.featsById.get(lf.featId);
        const aptitudeEntry = feat?.featsAptitudesInRules?.find((fa) => fa.aptitudeId === lf.aptitudeId);
        return { ...feat!, aptitudeId: lf.aptitudeId, aptitudeName: aptitudeEntry?.aptitudesInRule?.name ?? null, free: lf.free };
      });
      const levelSavesData = (rulesetData.klassLevelSavesByKlassLevelId.get(level.id) ?? [])
        .map((ls) => ({ saveId: ls.saveId, base: ls.base }));

      return {
        ...level,
        feats: levelFeatsData,
        saves: levelSavesData,
      };
    });

    return hooks.classLevels.enrichWithProperties(enrichedLevels, levelProperties);
  });
}

function buildClassLevelDetail<L extends KlassLevel>(
  ruleset: { baseRules: BaseRules },
  rulesetData: CachedRulesetData,
  level: L,
) {
  const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
  const properties = rulesetData.propertiesByEntity.get(level.id) ?? [];
  const modifiers = rulesetData.modifiersBySource.get(level.id) ?? [];
  const requirements = rulesetData.requirementsByEntity.get(level.id) ?? [];
  const levelFeats = rulesetData.klassLevelFeatsByKlassLevel.get(level.id) ?? [];
  const levelSaves = rulesetData.klassLevelSavesByKlassLevelId.get(level.id) ?? [];

  const featsData = levelFeats.map((lf) => {
    const feat = rulesetData.featsById.get(lf.featId);
    const aptitudeEntry = feat?.featsAptitudesInRules?.find((fa) => fa.aptitudeId === lf.aptitudeId);
    return { ...feat!, aptitudeId: lf.aptitudeId, aptitudeName: aptitudeEntry?.aptitudesInRule?.name ?? null, free: lf.free };
  });
  const savesData = levelSaves.map((ls) => ({ saveId: ls.saveId, base: ls.base }));

  return {
    ...hooks.classLevels.enrichWithProperties([level], properties)[0],
    feats: featsData,
    saves: savesData,
    modifiers,
    properties,
    requirements,
  };
}

export const ClassLevelsMethods = {
  async getRulesetKlassLevels(rulesetId: string, klassId: string) {
    return await listClassLevels(rulesetId, klassId);
  },

  async getClassLevels(rulesetId: string, classId: string) {
    return await listClassLevels(rulesetId, classId);
  },

  async getClassLevel(rulesetId: string, classId: string, levelId: string) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const klass = rulesetData.klassesById.get(classId);
      verifyKlassLineage(klass, rulesetId, sourceChain);

      const level = rulesetData.klassLevelsById.get(levelId);
      if (!level || level.klassId !== klass.id) throw new NotFoundError("Class level not found");

      return buildClassLevelDetail(ruleset, rulesetData, level);
    });
  },

  async getClassLevelById(rulesetId: string, classLevelId: string) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;

      const level = rulesetData.klassLevelsById.get(classLevelId);
      if (!level) throw new NotFoundError("Class level not found");

      const klass = rulesetData.klassesById.get(level.klassId);
      verifyKlassLineage(klass, rulesetId, sourceChain);

      // `name` is attached so clients of getClassLevelById can show the class
      // name without a second fetch.
      return buildClassLevelDetail(ruleset, rulesetData, { ...level, name: klass.name });
    });
  },

  async getClassLevelSpells(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const klass = rulesetData.klassesById.get(classId);
      verifyKlassLineage(klass, rulesetId, sourceChain);

      const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
      const levels = rulesetData.klassLevelsByKlassId.get(klass.id) ?? [];
      const modifiers: Modifier[] = [];
      for (const level of levels) {
        const ms = rulesetData.modifiersBySource.get(level.id);
        if (ms) modifiers.push(...ms);
      }

      return hooks.classLevels.enrichWithSpellsPerDay(levels, modifiers);
    });
  },

  async getClassLevelSpellsKnown(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const klass = rulesetData.klassesById.get(classId);
      verifyKlassLineage(klass, rulesetId, sourceChain);

      const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
      const levels = rulesetData.klassLevelsByKlassId.get(klass.id) ?? [];
      const modifiers: Modifier[] = [];
      for (const level of levels) {
        const ms = rulesetData.modifiersBySource.get(level.id);
        if (ms) modifiers.push(...ms);
      }

      return hooks.classLevels.enrichWithSpellsKnown(levels, modifiers);
    });
  },

  async getClassSpellList(
    rulesetId: string,
    classId: string,
    where: { level?: number; search?: string },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const klass = rulesetData.klassesById.get(classId);
      verifyKlassLineage(klass, rulesetId, sourceChain);

      const levels = rulesetData.klassLevelsByKlassId.get(klass.id) ?? [];
      const modifiers: Modifier[] = [];
      for (const level of levels) {
        const ms = rulesetData.modifiersBySource.get(level.id);
        if (ms) modifiers.push(...ms);
      }

      const spellsRegex = /^aptitudes\.(\w+)\.\d+\.uses$/;
      const slugs = new Set<string>();
      for (const mod of modifiers) {
        const match = spellsRegex.exec(mod.target);
        if (match) slugs.add(match[1]);
      }

      if (slugs.size === 0) {
        return { items: [], total: 0, page: pagination.page, limit: pagination.limit, nextPage: null };
      }

      const candidates = rulesetData.aptitudes.filter((a) => slugs.has(stripSeparators(a.name)));
      const aptitude = candidates.find((a) => a.rulesetId === klass.rulesetId) ?? candidates[0];
      if (!aptitude) {
        return { items: [], total: 0, page: pagination.page, limit: pagination.limit, nextPage: null };
      }

      return PowersMethods.getRulesetPowers(
        rulesetId,
        { aptitudeId: aptitude.id, level: where.level, search: where.search },
        pagination,
      );
    });
  },

  async getClassLevelFeatPools(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const klass = rulesetData.klassesById.get(classId);
      verifyKlassLineage(klass, rulesetId, sourceChain);

      const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
      const levels = rulesetData.klassLevelsByKlassId.get(klass.id) ?? [];

      const levelModifiers: Modifier[] = [];
      const levelFeats: KlassLevelFeat[] = [];
      for (const level of levels) {
        const ms = rulesetData.modifiersBySource.get(level.id);
        if (ms) levelModifiers.push(...ms);
        const lfs = rulesetData.klassLevelFeatsByKlassLevel.get(level.id);
        if (lfs) levelFeats.push(...lfs);
      }

      // Stackable feats (e.g. "Bonus Feat (Fighter)") share one feat record linked
      // to multiple klass levels, so we duplicate the modifier per level occurrence.
      const remappedFeatModifiers: Modifier[] = [];
      for (const lf of levelFeats) {
        const mods = rulesetData.modifiersBySource.get(lf.featId);
        if (!mods) continue;
        for (const mod of mods) {
          if (mod.sourceType !== "feats") continue;
          remappedFeatModifiers.push({ ...mod, sourceId: lf.klassLevelId });
        }
      }

      return hooks.classLevels.enrichWithFeatPools(levels, [...levelModifiers, ...remappedFeatModifiers], rulesetData.aptitudes);
    });
  },

  async createClassLevel(session: Session, rulesetId: string, classId: string, body: {
    level: number;
    bab: number;
    skills: number;
    saves?: Array<{ saveId: string; base: number }>;
    feats?: Array<{ featId: string; aptitudeId: string; free?: boolean }>;
  }) {
    let klassRulesetId: string | undefined;
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();
        const klass = rulesetData.klassesById.get(classId);
        verifyKlassLineage(klass, rulesetId, sourceChain);
        klassRulesetId = klass.rulesetId;

        // COW the klass if it's inherited — without this, the new level row
        // would be inserted with klassId pointing at the parent ruleset's klass,
        // corrupting the parent.
        let targetKlassId = klass.id;
        if (klass.rulesetId !== rulesetId) {
          const cowResult = await cowEntity(tx, "klasses", klass.id, rulesetId, sourceChain);
          targetKlassId = cowResult.id as string;
        }

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        const { feats, saves, bab, skills, ...levelData } = body;
        const rows = await KlassLevels.create(tx, {
          ...levelData,
          klassId: targetKlassId,
        });
        const klassLevel = rows[0];

        await hooks.classLevels.syncProperties(tx, klassLevel.id, { bab, skills });

        if (feats && feats.length > 0) {
          for (const feat of feats) {
            await KlassLevelFeats.create(tx, {
              klassLevelId: klassLevel.id,
              featId: feat.featId,
              aptitudeId: feat.aptitudeId,
              free: feat.free ?? true,
            });
          }
        }

        if (saves && saves.length > 0) {
          await KlassLevelSaves.createMany(tx, saves.map((s) => ({
            klassLevelId: klassLevel.id,
            saveId: s.saveId,
            base: s.base,
          })));
        }

        if (klassLevel.level > 1) {
          const normalizedKlassName = stripSeparators(klass.name);
          await Requirements.create(tx, {
            entityId: klassLevel.id,
            entityType: "klass_levels",
            level: "1",
            target: `classes.${normalizedKlassName}.level`,
            value: (klassLevel.level - 1).toString(),
            valueType: "number",
            operator: "greater_than",
          });
        }

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: klassLevel.id,
          targetTable: getTableName(klassLevelsInRules),
          type: "createKlassLevel",
          data: { entityName: klass.name, level: klassLevel.level },
        });

        return { ...klassLevel, bab, skills };
      });
    });
    invalidateRuleset(rulesetId);
    if (klassRulesetId && klassRulesetId !== rulesetId) invalidateRuleset(klassRulesetId);
    return result;
  },

  async updateClassLevel(session: Session, rulesetId: string, classId: string, levelId: string, body: {
    bab?: number;
    skills?: number;
    saves?: Array<{ saveId: string; base: number }>;
    feats?: Array<{ featId: string; aptitudeId: string; free?: boolean }>;
  }) {
    let klassRulesetId: string | undefined;
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();
        const klass = rulesetData.klassesById.get(classId);
        verifyKlassLineage(klass, rulesetId, sourceChain);
        klassRulesetId = klass.rulesetId;

        const level = rulesetData.klassLevelsById.get(levelId);
        if (!level || level.klassId !== klass.id) throw new NotFoundError("Level not found for this class");

        // COW the parent klass if inherited so writes don't corrupt the parent.
        const resolvedLevelId = await cowEntityForCustomization(tx, rulesetId, "klass_levels", level.id);

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        const { feats, saves, bab, skills } = body;

        if (bab !== undefined || skills !== undefined) {
          // When the COW just happened, the new level's properties exist in
          // the DB but not in rulesetData.propertiesByEntity (composed before
          // the COW). Read straight from the DB so a partial body doesn't
          // silently zero the unspecified field.
          const currentProps = resolvedLevelId === level.id
            ? rulesetData.propertiesByEntity.get(resolvedLevelId) ?? []
            : await Properties.findManyByEntity(tx, { entityIds: [resolvedLevelId], entityType: "klass_levels" });
          const currentValues = hooks.classLevels.readCurrentValues(currentProps);

          await hooks.classLevels.syncProperties(tx, resolvedLevelId, {
            bab: bab ?? currentValues.bab,
            skills: skills ?? currentValues.skills,
          });
        }

        if (feats !== undefined) {
          await KlassLevelFeats.deleteByKlassLevelId(tx, { klassLevelId: resolvedLevelId });

          if (feats.length > 0) {
            await KlassLevelFeats.createMany(tx,
              feats.map((feat) => ({
                klassLevelId: resolvedLevelId,
                featId: feat.featId,
                aptitudeId: feat.aptitudeId,
                free: feat.free ?? true,
              })),
            );
          }
        }

        if (saves !== undefined) {
          await KlassLevelSaves.deleteByKlassLevelId(tx, { klassLevelId: resolvedLevelId });

          if (saves.length > 0) {
            await KlassLevelSaves.createMany(tx,
              saves.map((s) => ({
                klassLevelId: resolvedLevelId,
                saveId: s.saveId,
                base: s.base,
              })),
            );
          }
        }

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: resolvedLevelId,
          targetTable: getTableName(klassLevelsInRules),
          type: "updateKlassLevel",
          data: { entityName: klass.name, level: level.level },
        });

        const finalProps = await Properties.findManyByEntity(tx, {
          entityIds: [resolvedLevelId],
          entityType: "klass_levels",
        });

        return hooks.classLevels.enrichWithProperties([{ ...level, id: resolvedLevelId }], finalProps)[0];
      });
    });
    invalidateRuleset(rulesetId);
    if (klassRulesetId && klassRulesetId !== rulesetId) invalidateRuleset(klassRulesetId);
    return result;
  },

  async deleteClassLevel(session: Session, rulesetId: string, classId: string, levelId: string) {
    let klassRulesetId: string | undefined;
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await entityHasCharacterPicks(tx, "klass_levels", levelId, rulesetId);
        (await getRulesetPolicy(tx, session, ruleset)).canDeleteEntity({ inUse });
        const klass = rulesetData.klassesById.get(classId);
        verifyKlassLineage(klass, rulesetId, sourceChain);
        klassRulesetId = klass.rulesetId;

        const level = rulesetData.klassLevelsById.get(levelId);
        if (!level || level.klassId !== klass.id) throw new NotFoundError("Level not found for this class");

        // COW the parent klass if the level is inherited — without this, hard-delete
        // would wipe the parent ruleset's row. cowEntityForCustomization on
        // "klass_levels" duplicates the entire klass into the user's ruleset and
        // returns the level id in the new copy.
        const resolvedLevelId = await cowEntityForCustomization(tx, rulesetId, "klass_levels", level.id);

        // Customizations are polymorphic FKs — Postgres can't cascade these.
        await deleteRequirementsWithCascade(tx, { entityIds: [resolvedLevelId], entityType: "klass_levels" });
        await deletePropertiesWithCascade(tx, { entityIds: [resolvedLevelId], entityType: "klass_levels" });
        await deleteModifiersWithCascade(tx, { sourceIds: [resolvedLevelId], sourceType: "klass_levels" });

        // FK CASCADE on klass_level_feats / klass_level_powers / klass_level_saves
        // wipes those join rows when the level row is deleted.
        const rows = await KlassLevels.delete(tx, { id: resolvedLevelId });
        const deletedLevel = rows[0];

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: deletedLevel.id,
          targetTable: getTableName(klassLevelsInRules),
          type: "deleteKlassLevel",
          data: { rulesetId, entityName: klass.name, level: deletedLevel.level },
        });

        return deletedLevel;
      });
    });
    invalidateRuleset(rulesetId);
    if (klassRulesetId && klassRulesetId !== rulesetId) invalidateRuleset(klassRulesetId);
    return result;
  },
} as const;

class ClassLevelsService extends BaseService<typeof ClassLevelsMethods> {
  static initialize() {
    return new ClassLevelsService(ClassLevelsMethods);
  }
}

export default ClassLevelsService;
