import { getTableName } from "drizzle-orm";

import { klassLevelsInRules } from "@/drizzle/schema.ts";
import { describeClassFeatPools, describeClassLevels, planClassLevelSave, type RulesetView } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { findScopedEntity, RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { KlassLevelFeats, KlassLevels, KlassLevelSaves, Properties } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { writeEntityWrites } from "@/server/services/rulesets/entityWrites.ts";
import type { KlassLevel, Session } from "@/shared/relations.ts";

import { ListsSpells } from "./concerns/ListsSpells.ts";

/**
 * A class level's body: the feats it grants, its saves' base bonuses, and the fields its ruleset's rules keep
 * (`planClassLevelSave`).
 */
type ClassLevelBody = Parameters<typeof planClassLevelSave>[2] & {
  feats?: Array<{ aptitudeId: string; featId: string; free?: boolean }>;
  saves?: Array<{ base: number; saveId: string }>;
};

class ClassLevelsService extends include(Object, ListsSpells) {
  private buildClassLevelDetail<L extends KlassLevel>(scope: RulesetView, level: L) {
    const { rulesetData } = scope;
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
      ...describeClassLevels(scope, [level])[0],
      feats: featsData,
      saves: savesData,
      modifiers,
      properties,
      requirements,
    };
  }

  private async listClassLevels(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { rulesetData } = scope;
      const { sourceChain } = rulesetData.cow;
      const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");
      const levels = rulesetData.klassLevelsByKlassId.get(klass.id) ?? [];

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

      return describeClassLevels(scope, enrichedLevels);
    });
  }

  async createClassLevel(
    session: Session,
    rulesetId: string,
    classId: string,
    body: ClassLevelBody & { level: number },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          const { sourceChain } = rulesetData.cow;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();
          const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");
          const writes = planClassLevelSave(scope, klass, body);

          // Copy an inherited class: the new level row would otherwise belong to the parent ruleset's class.
          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { id: targetKlassId } = await edit.cowToEdit(tx, "klasses", klass);

          const { feats, saves } = body;
          const rows = await KlassLevels.create(tx, { level: body.level, klassId: targetKlassId });
          const klassLevel = rows[0];
          const entity = { entityId: klassLevel.id, entityType: "klass_levels" } as const;

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

          const properties = await writeEntityWrites(tx, scope, entity, writes);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: klassLevel.id,
            targetTable: getTableName(klassLevelsInRules),
            type: "createKlassLevel",
            data: { entityName: klass.name, level: klassLevel.level },
          });

          return describeClassLevels(scope, [klassLevel], properties)[0];
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async deleteClassLevel(session: Session, rulesetId: string, classId: string, levelId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
          const { sourceChain } = rulesetData.cow;

          const inUse = await hasCharacterPicks(tx, "klass_levels", levelId, rulesetId);
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });
          const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");

          const level = rulesetData.klassLevelsById.get(levelId);
          if (!level || level.klassId !== klass.id) throw new NotFoundError("Level not found for this class");

          // COW the parent klass if the level is inherited — without this, hard-delete
          // would wipe the parent ruleset's row. RulesetEdit.cowOwner on
          // "klass_levels" duplicates the entire klass into the user's ruleset and
          // returns the level id in the new copy.
          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const resolvedLevelId = await edit.cowOwner(tx, "klass_levels", level.id);

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
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async getClassLevel(rulesetId: string, classId: string, levelId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { rulesetData } = scope;
      const { sourceChain } = rulesetData.cow;
      const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");

      const level = rulesetData.klassLevelsById.get(levelId);
      if (!level || level.klassId !== klass.id) throw new NotFoundError("Class level not found");

      return this.buildClassLevelDetail(scope, level);
    });
  }

  async getClassLevelFeatPools(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { sourceChain } = scope.rulesetData.cow;
      const klass = findScopedEntity(scope.rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");
      return describeClassFeatPools(scope, klass.id);
    });
  }

  async getClassLevels(rulesetId: string, classId: string) {
    return await this.listClassLevels(rulesetId, classId);
  }

  async getClassLevelWithClassName(rulesetId: string, classLevelId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { rulesetData } = scope;
      const { sourceChain } = rulesetData.cow;

      const level = rulesetData.klassLevelsById.get(classLevelId);
      if (!level) throw new NotFoundError("Class level not found");

      const klass = findScopedEntity(rulesetData.klassesById, level.klassId, rulesetId, sourceChain, "Class");

      // Its class's name, which its page shows, and the ruleset that holds its class: an inherited one's level is
      // inherited too
      return this.buildClassLevelDetail(scope, { ...level, name: klass.name, rulesetId: klass.rulesetId });
    });
  }

  async updateClassLevel(session: Session, rulesetId: string, classId: string, levelId: string, body: ClassLevelBody) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          const { sourceChain } = rulesetData.cow;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();
          const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");

          const level = rulesetData.klassLevelsById.get(levelId);
          if (!level || level.klassId !== klass.id) throw new NotFoundError("Level not found for this class");

          // COW the parent klass if inherited so writes don't corrupt the parent.
          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const resolvedLevelId = await edit.cowOwner(tx, "klass_levels", level.id);

          const { feats, saves } = body;
          const entity = { entityId: resolvedLevelId, entityType: "klass_levels" } as const;

          // What it kept: a level the copy just made has its properties in the database, not in the view
          const kept = await Properties.findMany(tx, { entityIds: [resolvedLevelId], entityType: "klass_levels" });
          await writeEntityWrites(tx, scope, entity, planClassLevelSave(scope, klass, body, { properties: kept }));

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

          return describeClassLevels(scope, [{ ...level, id: resolvedLevelId }], finalProps)[0];
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new ClassLevelsService();
