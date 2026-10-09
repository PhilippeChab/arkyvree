import { getTableName } from "drizzle-orm";

import { itemsInRules } from "@/drizzle/schema.ts";
import { describeItem, describeItems, planItemCreate, planItemDelete, planItemEdit } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import {
  copyEntityCustomizations,
  fetchEntityCustomizations,
  hasCharacterPicks,
  RulesetEdit,
} from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Items } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

import { Variants } from "./concerns/Variants.ts";

interface ItemBody {
  costGp?: number;
  description?: string | null;
  isTemplate?: boolean;
  name: string;
  slot?: ItemLocation;
  sourceItemId?: string;
  type?: string | null;
  updatedAt?: string;
  weight?: number;
}

class ItemsService extends include(Object, Variants) {
  /**
   * Adds an item to the ruleset. A duplicate of the item `duplicatedItemId` points at the same template, and takes its
   * customizations when it isn't a template itself; a template's copies get their properties from the template.
   */
  private async addRulesetItem(session: Session, rulesetId: string, body: ItemBody, duplicatedItemId?: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const plan = planItemCreate(scope, body, duplicatedItemId);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { tombstoneAncestorId } = await edit.assertNameAvailable(tx, "items", body.name);

          const rows = await Items.create(tx, { ...plan.columns, rulesetId });
          const item = rows[0];

          if (tombstoneAncestorId) await edit.repointTombstone(tx, "items", tombstoneAncestorId, item.id);

          const sourceId = plan.copyCustomizationsFrom;
          if (sourceId) {
            const cust = (await fetchEntityCustomizations(tx, [sourceId], "items", "items")).get(sourceId);
            if (cust) await copyEntityCustomizations(tx, item.id, "items", cust);
          }

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: item.id,
            targetTable: getTableName(itemsInRules),
            type: "createItem",
            data: { entityName: item.name },
          });

          return item;
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async createItem(session: Session, rulesetId: string, body: ItemBody) {
    return await this.addRulesetItem(session, rulesetId, body);
  }

  async deleteItem(session: Session, rulesetId: string, itemId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          const inUse = await hasCharacterPicks(tx, "items", itemId, rulesetId);
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

          const plan = planItemDelete(scope, itemId);
          const { item } = plan;
          // A template's copies, in any ruleset: its delete is refused while it has any
          if (plan.copiesOf) plan.checkCopies(await Items.findMany(tx, { sourceItemId: plan.copiesOf }));

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const targetId = await edit.cowToDelete(tx, "items", item);

          // The database deletes its customizations with it.
          const rows = await Items.delete(tx, { id: targetId });
          const deletedItem = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId,
            targetTable: getTableName(itemsInRules),
            type: "deleteItem",
            data: { rulesetId, entityName: item.name },
          });

          return deletedItem;
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async duplicateItem(session: Session, rulesetId: string, sourceItemId: string, body: ItemBody) {
    return await this.addRulesetItem(session, rulesetId, body, sourceItemId);
  }

  async getItem(rulesetId: string, itemId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => describeItem(scope, itemId));
  }

  async getItems(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      isTemplate?: boolean;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { sourceChain } = scope.rulesetData.cow;
      const result = await Items.findPage(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
      return { ...result, items: describeItems(scope, result.items) };
    });
  }

  async updateItem(session: Session, rulesetId: string, itemId: string, body: ItemBody) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const { columns, item } = planItemEdit(scope, itemId, body);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { id: targetId, copied } = await edit.cowToEdit(tx, "items", item);
          const expectedUpdatedAt = copied ? undefined : body.updatedAt;

          const rows = await Items.update(tx, columns, { id: targetId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          const updatedItem = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId,
            targetTable: getTableName(itemsInRules),
            type: "updateItem",
            data: {
              entityName: body.name,
              changedFields: getChangedFields(item, { ...body, sourceItemId: updatedItem.sourceItemId }),
            },
          });

          return updatedItem;
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new ItemsService();
