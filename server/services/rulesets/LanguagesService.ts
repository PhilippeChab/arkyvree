import { getTableName } from "drizzle-orm";

import { languagesInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Languages } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activityNotifications.ts";
import BaseService from "@/server/services/BaseService.ts";
import {
  assertEntityNameAvailable,
  entityHasCharacterPicks,
  entityToDelete,
  entityToEdit,
  findScopedEntity,
  repointTombstoneSnapshot,
  withRulesetScope,
} from "@/server/services/rulesets/cow.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import type { Session } from "@/shared/relations.ts";

const LanguagesMethods = {
  async getRulesetLanguages(
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
      return await Languages.findManyByRulesetId(
        db,
        { rulesetId, ancestorRulesetIds: sourceChain, ...where },
        pagination,
      );
    });
  },

  async getRulesetLanguage(rulesetId: string, languageId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const language = findScopedEntity(rulesetData.languagesById, languageId, rulesetId, sourceChain, "Language");
      return language;
    });
  },

  async createRulesetLanguage(
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
        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const { tombstoneAncestorId } = await assertEntityNameAvailable(
          tx,
          rulesetId,
          rulesetData.cow,
          "languages",
          body.name,
        );

        const rows = await Languages.create(tx, {
          ...body,
          rulesetId,
        });
        const language = rows[0];

        if (tombstoneAncestorId) {
          await repointTombstoneSnapshot(tx, rulesetId, "languages", tombstoneAncestorId, language.id);
        }

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
    invalidateRuleset(rulesetId);
    return result;
  },

  async updateRulesetLanguage(
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

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const language = findScopedEntity(rulesetData.languagesById, languageId, rulesetId, sourceChain, "Language");

        const { id: targetId, copied } = await entityToEdit(tx, ruleset, sourceChain, "languages", language);
        const expectedUpdatedAt = copied ? undefined : body.updatedAt;

        const { updatedAt: _u, ...languageData } = body;
        const rows = await Languages.update(tx, languageData, { id: targetId, expectedUpdatedAt });
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
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
    invalidateRuleset(rulesetId);
    return result;
  },

  async deleteRulesetLanguage(session: Session, rulesetId: string, languageId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await entityHasCharacterPicks(tx, "languages", languageId, rulesetId);
        (await getRulesetPolicy(tx, session, ruleset)).canDeleteEntity({ inUse });

        const language = findScopedEntity(rulesetData.languagesById, languageId, rulesetId, sourceChain, "Language");

        const targetId = await entityToDelete(tx, ruleset, sourceChain, "languages", language);

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
    invalidateRuleset(rulesetId);
    return result;
  },
} as const;

class LanguagesService extends BaseService<typeof LanguagesMethods> {
  static initialize() {
    return new LanguagesService(LanguagesMethods);
  }
}

export default LanguagesService;
