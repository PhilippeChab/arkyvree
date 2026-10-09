import { getTableName } from "drizzle-orm";

import { languagesInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { EntityEdit, EntityNames, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Languages } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { hasCharacterPicks } from "@/server/services/rulesets/characterPicks.ts";
import type { Session } from "@/shared/relations.ts";

class LanguagesService {
  async createLanguage(
    session: Session,
    rulesetId: string,
    body: {
      description?: string | null;
      name: string;
      type: string;
    },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const plan = Engine.for(scope).entities("languages").planCreate(body);
          const names = new EntityNames(ruleset, rulesetData.cow);
          const { tombstoneAncestorId } = await names.assertNameAvailable(tx, "languages", plan.name);

          const rows = await Languages.create(tx, { ...plan.columns, rulesetId });
          const language = rows[0];

          if (tombstoneAncestorId) await names.repointTombstone(tx, "languages", tombstoneAncestorId, language.id);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: language.id,
            targetTable: getTableName(languagesInRules),
            type: "createLanguage",
            data: { entityName: language.name },
          });

          return language;
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async deleteLanguage(session: Session, rulesetId: string, languageId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset } = scope;

          const inUse = await hasCharacterPicks(
            tx,
            "languages",
            scope.rulesetData.cow.getEquivalentIds(languageId),
            rulesetId,
          );
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

          const { entity: language } = Engine.for(scope).entities("languages").planDelete(languageId);

          const edit = new EntityEdit(ruleset);
          const targetId = await edit.cowToDelete(tx, "languages", language);

          // The database deletes its customizations with it.
          const rows = await Languages.delete(tx, { id: targetId });
          const deletedLanguage = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId,
            targetTable: getTableName(languagesInRules),
            type: "deleteLanguage",
            data: { rulesetId, entityName: language.name },
          });

          return deletedLanguage;
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async getLanguage(rulesetId: string, languageId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const language = Engine.for(scope).entities("languages").describe(languageId);
      return language;
    });
  }

  async getLanguages(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { rulesetData } = scope;
      return await Languages.findPage(db, { rulesetId, ...rulesetData.cow.listFilters, ...where }, pagination);
    });
  }

  async updateLanguage(
    session: Session,
    rulesetId: string,
    languageId: string,
    body: {
      description?: string | null;
      name: string;
      type: string;
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset } = scope;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const { columns, entity: language } = Engine.for(scope).entities("languages").planEdit(languageId, body);

          const edit = new EntityEdit(ruleset);
          const { id: targetId, copied } = await edit.cowToEdit(tx, "languages", language);
          const expectedUpdatedAt = copied ? undefined : body.updatedAt;

          const rows = await Languages.update(tx, columns, { id: targetId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          const updatedLanguage = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId,
            targetTable: getTableName(languagesInRules),
            type: "updateLanguage",
            data: {
              entityName: body.name,
              changedFields: getChangedFields(language, body),
            },
          });

          return updatedLanguage;
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }
}

export default new LanguagesService();
