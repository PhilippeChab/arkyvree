import { getTableName } from "drizzle-orm";

import { klassesInRules } from "@/drizzle/schema.ts";
import { findScopedEntity, RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Klasses } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

class ClassesService {
  async createClass(
    session: Session,
    rulesetId: string,
    body: {
      name: string;
      description?: string | null;
      hd?: number;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const { tombstoneAncestorId } = await edit.assertNameAvailable(tx, "klasses", body.name);

        const rows = await Klasses.create(tx, {
          ...body,
          rulesetId,
          hd: body.hd || 8,
        });
        const klass = rows[0];

        if (tombstoneAncestorId) await edit.repointTombstone(tx, "klasses", tombstoneAncestorId, klass.id);

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
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async deleteClass(session: Session, rulesetId: string, klassId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await hasCharacterPicks(tx, "klasses", klassId, rulesetId);
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

        const klass = findScopedEntity(rulesetData.klassesById, klassId, rulesetId, sourceChain, "Class");

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const targetId = await edit.cowToDelete(tx, "klasses", klass);

        // FK CASCADE wipes klass_levels (and their klass_level_feats /
        // klass_level_powers / klass_level_saves), klass_skills, and any
        // character_levels referencing this klass when the row is deleted.
        // The database deletes the class's and its levels' customizations.
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
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async getClass(rulesetId: string, klassId: string) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const klass = findScopedEntity(rulesetData.klassesById, klassId, rulesetId, sourceChain, "Class");

      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
      const properties = rulesetData.propertiesByEntity.get(klass.id) ?? [];
      const { bonusSpellAbilityId, bonusSpellPropertyId, casterTypeValue, casterTypePropertyId } =
        rulesetModule.rules.classes.readProperties(properties);

      return { ...klass, bonusSpellAbilityId, bonusSpellPropertyId, casterTypeValue, casterTypePropertyId };
    });
  }

  async getClasses(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      kind?: string;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      return await Klasses.findPage(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
    });
  }

  async updateClass(
    session: Session,
    rulesetId: string,
    klassId: string,
    body: {
      name: string;
      description?: string | null;
      hd?: number;
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const klass = findScopedEntity(rulesetData.klassesById, klassId, rulesetId, sourceChain, "Class");

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const { id: targetId, copied } = await edit.cowToEdit(tx, "klasses", klass);
        const expectedUpdatedAt = copied ? undefined : body.updatedAt;

        const { updatedAt: _u, ...klassData } = body;
        const rows = await Klasses.update(tx, klassData, { id: targetId, expectedUpdatedAt });
        if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

        const updatedKlass = rows[0];

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId,
          targetTable: getTableName(klassesInRules),
          type: "updateKlass",
          data: {
            entityName: body.name,
            changedFields: getChangedFields(klass, body),
          },
        });

        return updatedKlass;
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new ClassesService();
