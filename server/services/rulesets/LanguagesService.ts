import { languagesInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Languages } from "@/server/repositories/index.ts";
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

export const LanguagesMethods = {
  async getRulesetLanguages(
    rulesetId: string,
    where: { childOnly?: boolean; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      return await Languages.findManyByRulesetId(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
    });
  },

  async getRulesetLanguage(rulesetId: string, languageId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const language = rulesetData.languagesById.get(languageId);
      if (!language || (language.rulesetId !== rulesetId && !sourceChain.includes(language.rulesetId))) {
        throw new NotFoundError("Language not found in this ruleset");
      }
      return language;
    });
  },

  async createRulesetLanguage(session: Session, rulesetId: string, body: {
    name: string;
    description?: string | null;
    type: string;
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const { tombstoneAncestorId } = await assertEntityNameAvailable(tx, rulesetId, sourceChain, "languages", body.name);

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

  async updateRulesetLanguage(session: Session, rulesetId: string, languageId: string, body: {
    name: string;
    description?: string | null;
    type: string;
    updatedAt?: string;
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const language = rulesetData.languagesById.get(languageId);
        const isOwned = language && language.rulesetId === rulesetId;
        const isInherited = language && sourceChain.includes(language.rulesetId);
        if (!language || (!isOwned && !isInherited)) {
          throw new NotFoundError("Language not found in this ruleset");
        }

        let targetId = language.id;
        const expectedUpdatedAt = isOwned ? body.updatedAt : undefined;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "languages", language.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

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
          data: { entityName: body.name, changedFields: getChangedFields(language as Record<string, unknown>, body as Record<string, unknown>) },
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

        const language = rulesetData.languagesById.get(languageId);
        const isOwned = language && language.rulesetId === rulesetId;
        const isInherited = language && sourceChain.includes(language.rulesetId);
        if (!language || (!isOwned && !isInherited)) {
          throw new NotFoundError("Language not found in this ruleset");
        }

        let targetId = language.id;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "languages", language.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

        // Customizations are polymorphic FKs — Postgres can't cascade these.
        await deleteModifiersWithCascade(tx, { sourceIds: [targetId], sourceType: "languages" });
        await deletePropertiesWithCascade(tx, { entityIds: [targetId], entityType: "languages" });
        await deleteRequirementsWithCascade(tx, { entityIds: [targetId], entityType: "languages" });

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
