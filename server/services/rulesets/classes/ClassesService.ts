import { getTableName } from "drizzle-orm";

import { klassesInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { EntityEdit, EntityNames, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Klasses } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { hasCharacterPicks } from "@/server/services/rulesets/characterPicks.ts";
import type { Session } from "@/shared/relations.ts";

class ClassesService {
  async createClass(
    session: Session,
    rulesetId: string,
    body: {
      description?: string | null;
      hd?: number;
      name: string;
    },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const names = new EntityNames(ruleset, rulesetData.cow);
          const { tombstoneAncestorId } = await names.assertNameAvailable(tx, "klasses", body.name);

          const rows = await Klasses.create(tx, {
            ...Engine.for(scope).entities("klasses").planCreate(body).columns,
            rulesetId,
          });
          const klass = rows[0];

          if (tombstoneAncestorId) await names.repointTombstone(tx, "klasses", tombstoneAncestorId, klass.id);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: klass.id,
            targetTable: getTableName(klassesInRules),
            type: "createKlass",
            data: { entityName: klass.name },
          });

          return klass;
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async deleteClass(session: Session, rulesetId: string, klassId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset } = scope;

          const inUse = await hasCharacterPicks(
            tx,
            "klasses",
            scope.rulesetData.cow.getEquivalentIds(klassId),
            rulesetId,
          );
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

          const { entity: klass } = Engine.for(scope).entities("klasses").planDelete(klassId);

          const edit = new EntityEdit(ruleset);
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
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async getClass(rulesetId: string, klassId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).class(klassId).describe());
  }

  async getClasses(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      kind?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const result = await Klasses.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...where },
        pagination,
      );
      return { ...result, items: Engine.for(scope).entities("klasses").describePage(result.items) };
    });
  }

  async updateClass(
    session: Session,
    rulesetId: string,
    klassId: string,
    body: {
      description?: string | null;
      hd?: number;
      name: string;
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset } = scope;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const { columns, entity: klass } = Engine.for(scope).entities("klasses").planEdit(klassId, body);

          const edit = new EntityEdit(ruleset);
          const { id: targetId, copied } = await edit.cowToEdit(tx, "klasses", klass);
          const expectedUpdatedAt = copied ? undefined : body.updatedAt;

          const rows = await Klasses.update(tx, columns, { id: targetId, expectedUpdatedAt });
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
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }
}

export default new ClassesService();
