import { getTableName } from "drizzle-orm";

import { languagesInRules } from "@/drizzle/schema.ts";
import { findScopedEntity, RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Languages } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

class LanguagesService {
  async createLanguage(
    session: Session,
    rulesetId: string,
    body: {
      name: string;
      description?: string | null;
      type: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const { tombstoneAncestorId } = await edit.assertNameAvailable(tx, "languages", body.name);

        const rows = await Languages.create(tx, {
          ...body,
          rulesetId,
        });
        const language = rows[0];

        if (tombstoneAncestorId) await edit.repointTombstone(tx, "languages", tombstoneAncestorId, language.id);

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: language.id,
          targetTable: getTableName(languagesInRules),
          type: "createLanguage",
          data: { entityName: language.name },
        });

        return language;
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async deleteLanguage(session: Session, rulesetId: string, languageId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await hasCharacterPicks(tx, "languages", languageId, rulesetId);
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

        const language = findScopedEntity(rulesetData.languagesById, languageId, rulesetId, sourceChain, "Language");

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
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
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async getLanguage(rulesetId: string, languageId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const language = findScopedEntity(rulesetData.languagesById, languageId, rulesetId, sourceChain, "Language");
      return language;
    });
  }

  async getLanguages(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      return await Languages.findPage(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
    });
  }

  async updateLanguage(
    session: Session,
    rulesetId: string,
    languageId: string,
    body: {
      name: string;
      description?: string | null;
      type: string;
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const language = findScopedEntity(rulesetData.languagesById, languageId, rulesetId, sourceChain, "Language");

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const { id: targetId, copied } = await edit.cowToEdit(tx, "languages", language);
        const expectedUpdatedAt = copied ? undefined : body.updatedAt;

        const { updatedAt: _u, ...languageData } = body;
        const rows = await Languages.update(tx, languageData, { id: targetId, expectedUpdatedAt });
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
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new LanguagesService();
