import { klassesInRules } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Klasses, KlassLevels } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import BaseService from "@/server/services/BaseService.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activityNotifications.ts";
import {
  assertEntityNameAvailable,
  cowEntity,
  deleteModifiersWithCascade,
  deletePropertiesWithCascade,
  deleteRequirementsWithCascade,
  entityHasCharacterPicks,
  repointTombstoneSnapshot,
  withRulesetScope,
} from "@/server/services/rulesets/cow.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import type { Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";

export const ClassesMethods = {
  async getRulesetKlasses(
    rulesetId: string,
    where: { childOnly?: boolean; kind?: string; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain, siblingIds } = rulesetData.cow;
      return await Klasses.findManyByRulesetId(db, { rulesetId, ancestorRulesetIds: sourceChain, siblingLoserIds: siblingIds, ...where }, pagination);
    });
  },

  async getRulesetKlass(rulesetId: string, klassId: string) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const klass = rulesetData.klassesById.get(klassId);
      if (!klass || (klass.rulesetId !== rulesetId && !sourceChain.includes(klass.rulesetId))) {
        throw new NotFoundError("Class not found in this ruleset");
      }

      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
      const properties = rulesetData.propertiesByEntity.get(klass.id) ?? [];
      const { bonusSpellAbilityId, bonusSpellPropertyId, casterTypeValue, casterTypePropertyId } =
        rulesetModule.hooks.classes.readClassProperties(properties);

      return { ...klass, bonusSpellAbilityId, bonusSpellPropertyId, casterTypeValue, casterTypePropertyId };
    });
  },

  async createRulesetKlass(session: Session, rulesetId: string, body: {
    name: string;
    description?: string | null;
    hd?: number;
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const { tombstoneAncestorId } = await assertEntityNameAvailable(tx, rulesetId, sourceChain, "klasses", body.name);

        const rows = await Klasses.create(tx, {
          ...body,
          rulesetId,
          hd: body.hd || 8,
        });
        const klass = rows[0];

        if (tombstoneAncestorId) {
          await repointTombstoneSnapshot(tx, rulesetId, "klasses", tombstoneAncestorId, klass.id);
        }

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: klass.id,
          targetTable: getTableName(klassesInRules),
          type: "createKlass",
          data: { entityName: klass.name },
        });

        return klass;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async updateRulesetKlass(session: Session, rulesetId: string, klassId: string, body: {
    name: string;
    description?: string | null;
    hd?: number;
    updatedAt?: string;
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const klass = rulesetData.klassesById.get(klassId);
        const isOwned = klass && klass.rulesetId === rulesetId;
        const isInherited = klass && sourceChain.includes(klass.rulesetId);
        if (!klass || (!isOwned && !isInherited)) {
          throw new NotFoundError("Class not found in this ruleset");
        }

        let targetId = klass.id;
        const expectedUpdatedAt = isOwned ? body.updatedAt : undefined;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "klasses", klass.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

        const { updatedAt: _u, ...klassData } = body;
        const rows = await Klasses.update(tx, klassData, { id: targetId, expectedUpdatedAt });
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
        const updatedKlass = rows[0];

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId,
          targetTable: getTableName(klassesInRules),
          type: "updateKlass",
          data: { entityName: body.name, changedFields: getChangedFields(klass as Record<string, unknown>, body as Record<string, unknown>) },
        });

        return updatedKlass;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async deleteRulesetKlass(session: Session, rulesetId: string, klassId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await entityHasCharacterPicks(tx, "klasses", klassId, rulesetId);
        (await getRulesetPolicy(tx, session, ruleset)).canDeleteEntity({ inUse });

        const klass = rulesetData.klassesById.get(klassId);
        const isOwned = klass && klass.rulesetId === rulesetId;
        const isInherited = klass && sourceChain.includes(klass.rulesetId);
        if (!klass || (!isOwned && !isInherited)) {
          throw new NotFoundError("Class not found in this ruleset");
        }

        let targetId = klass.id;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "klasses", klass.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

        // Per-level customizations are polymorphic FKs — Postgres can't cascade these.
        const levels = await KlassLevels.findManyByKlass(tx, { klassId: targetId });
        const levelIds = levels.map((l) => l.id);
        if (levelIds.length > 0) {
          await deleteModifiersWithCascade(tx, { sourceIds: levelIds, sourceType: "klass_levels" });
          await deletePropertiesWithCascade(tx, { entityIds: levelIds, entityType: "klass_levels" });
          await deleteRequirementsWithCascade(tx, { entityIds: levelIds, entityType: "klass_levels" });
        }

        // Klass customizations (polymorphic FKs).
        await deleteModifiersWithCascade(tx, { sourceIds: [targetId], sourceType: "klasses" });
        await deletePropertiesWithCascade(tx, { entityIds: [targetId], entityType: "klasses" });
        await deleteRequirementsWithCascade(tx, { entityIds: [targetId], entityType: "klasses" });

        // FK CASCADE wipes klass_levels (and their klass_level_feats /
        // klass_level_powers / klass_level_saves), klass_skills, and any
        // character_levels referencing this klass when the row is deleted.
        const rows = await Klasses.delete(tx, { id: targetId });
        const deletedKlass = rows[0];

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId,
          targetTable: getTableName(klassesInRules),
          type: "deleteKlass",
          data: { rulesetId, entityName: klass.name },
        });

        return deletedKlass;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },
} as const;

class ClassesService extends BaseService<typeof ClassesMethods> {
  static initialize() {
    return new ClassesService(ClassesMethods);
  }
}

export default ClassesService;
