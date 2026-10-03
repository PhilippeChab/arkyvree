import { getTableName } from "drizzle-orm";

import { klassLevelsInRules } from "@/drizzle/schema.ts";
import { type CachedRulesetData, invalidateRuleset } from "@/server/cache/rulesetCache/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { include } from "@/server/mixins.ts";
import {
  KlassLevelFeats,
  KlassLevels,
  KlassLevelSaves,
  Properties,
  Requirements,
} from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import {
  cowEntityForCustomization,
  entityHasCharacterPicks,
  entityToEdit,
  findScopedEntity,
  withRulesetScope,
} from "@/server/services/rulesets/cow/index.ts";
import type { BaseRules } from "@/shared/enums.ts";
import type { KlassLevel, KlassLevelFeat, Modifier, Property, Session } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import { ListsSpells } from "./concerns/ListsSpells.ts";

class ClassLevelsService extends include(Object, ListsSpells) {
  private buildClassLevelDetail<L extends KlassLevel>(
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
      return {
        ...feat!,
        aptitudeId: lf.aptitudeId,
        aptitudeName: aptitudeEntry?.aptitudesInRule?.name ?? null,
        free: lf.free,
      };
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

  private async listClassLevels(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");

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
          return {
            ...feat!,
            aptitudeId: lf.aptitudeId,
            aptitudeName: aptitudeEntry?.aptitudesInRule?.name ?? null,
            free: lf.free,
          };
        });
        const levelSavesData = (rulesetData.klassLevelSavesByKlassLevelId.get(level.id) ?? []).map((ls) => ({
          saveId: ls.saveId,
          base: ls.base,
        }));

        return {
          ...level,
          feats: levelFeatsData,
          saves: levelSavesData,
        };
      });

      return hooks.classLevels.enrichWithProperties(enrichedLevels, levelProperties);
    });
  }

  async getClassLevel(rulesetId: string, classId: string, levelId: string) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");

      const level = rulesetData.klassLevelsById.get(levelId);
      if (!level || level.klassId !== klass.id) throw new NotFoundError("Class level not found");

      return this.buildClassLevelDetail(ruleset, rulesetData, level);
    });
  }

  async getClassLevelById(rulesetId: string, classLevelId: string) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;

      const level = rulesetData.klassLevelsById.get(classLevelId);
      if (!level) throw new NotFoundError("Class level not found");

      const klass = findScopedEntity(rulesetData.klassesById, level.klassId, rulesetId, sourceChain, "Class");

      // `name` is attached so clients of getClassLevelById can show the class
      // name without a second fetch.
      return this.buildClassLevelDetail(ruleset, rulesetData, { ...level, name: klass.name });
    });
  }

  async getClassLevelFeatPools(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");

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

      return hooks.classLevels.enrichWithFeatPools(
        levels,
        [...levelModifiers, ...remappedFeatModifiers],
        rulesetData.aptitudes,
      );
    });
  }

  async getClassLevels(rulesetId: string, classId: string) {
    return await this.listClassLevels(rulesetId, classId);
  }

  async createClassLevel(
    session: Session,
    rulesetId: string,
    classId: string,
    body: {
      level: number;
      bab: number;
      skills: number;
      saves?: Array<{ saveId: string; base: number }>;
      feats?: Array<{ featId: string; aptitudeId: string; free?: boolean }>;
    },
  ) {
    let klassRulesetId: string | undefined;
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();
        const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");
        klassRulesetId = klass.rulesetId;

        // Copy an inherited class: the new level row would otherwise belong to the parent ruleset's class.
        const { id: targetKlassId } = await entityToEdit(tx, ruleset, sourceChain, "klasses", klass);

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
          await KlassLevelSaves.createMany(
            tx,
            saves.map((s) => ({
              klassLevelId: klassLevel.id,
              saveId: s.saveId,
              base: s.base,
            })),
          );
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
  }

  async updateClassLevel(
    session: Session,
    rulesetId: string,
    classId: string,
    levelId: string,
    body: {
      bab?: number;
      skills?: number;
      saves?: Array<{ saveId: string; base: number }>;
      feats?: Array<{ featId: string; aptitudeId: string; free?: boolean }>;
    },
  ) {
    let klassRulesetId: string | undefined;
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();
        const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");
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
          const currentProps =
            resolvedLevelId === level.id
              ? (rulesetData.propertiesByEntity.get(resolvedLevelId) ?? [])
              : await Properties.findMany(tx, { entityIds: [resolvedLevelId], entityType: "klass_levels" });
          const currentValues = hooks.classLevels.readCurrentValues(currentProps);

          await hooks.classLevels.syncProperties(tx, resolvedLevelId, {
            bab: bab ?? currentValues.bab,
            skills: skills ?? currentValues.skills,
          });
        }

        if (feats !== undefined) {
          await KlassLevelFeats.delete(tx, { klassLevelId: resolvedLevelId });

          if (feats.length > 0) {
            await KlassLevelFeats.createMany(
              tx,
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
          await KlassLevelSaves.delete(tx, { klassLevelId: resolvedLevelId });

          if (saves.length > 0) {
            await KlassLevelSaves.createMany(
              tx,
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

        const finalProps = await Properties.findMany(tx, {
          entityIds: [resolvedLevelId],
          entityType: "klass_levels",
        });

        return hooks.classLevels.enrichWithProperties([{ ...level, id: resolvedLevelId }], finalProps)[0];
      });
    });
    invalidateRuleset(rulesetId);
    if (klassRulesetId && klassRulesetId !== rulesetId) invalidateRuleset(klassRulesetId);
    return result;
  }

  async deleteClassLevel(session: Session, rulesetId: string, classId: string, levelId: string) {
    let klassRulesetId: string | undefined;
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await entityHasCharacterPicks(tx, "klass_levels", levelId, rulesetId);
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });
        const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");
        klassRulesetId = klass.rulesetId;

        const level = rulesetData.klassLevelsById.get(levelId);
        if (!level || level.klassId !== klass.id) throw new NotFoundError("Level not found for this class");

        // COW the parent klass if the level is inherited — without this, hard-delete
        // would wipe the parent ruleset's row. cowEntityForCustomization on
        // "klass_levels" duplicates the entire klass into the user's ruleset and
        // returns the level id in the new copy.
        const resolvedLevelId = await cowEntityForCustomization(tx, rulesetId, "klass_levels", level.id);

        // FK CASCADE on klass_level_feats / klass_level_powers / klass_level_saves
        // wipes those join rows when the level row is deleted.
        // The database deletes its customizations with it.
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
  }
}

export default new ClassLevelsService();
