import { getTableName } from "drizzle-orm";

import { itemsInRules } from "@/drizzle/schema.ts";
import { findScopedEntity, RulesetCache } from "@/server/cache/rulesetCache/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import {
  copyEntityCustomizations,
  fetchEntityCustomizations,
  hasCharacterPicks,
  RulesetEdit,
} from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { include } from "@/server/mixins.ts";
import { Items } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

import { Variants } from "./concerns/Variants.ts";

interface ItemBody {
  name: string;
  description?: string | null;
  weight?: number;
  costGp?: number;
  type?: string | null;
  slot?: ItemLocation;
  sourceItemId?: string;
  isTemplate?: boolean;
  updatedAt?: string;
}

class ItemsService extends include(Object, Variants) {
  /**
   * Adds an item to the ruleset. A duplicate of the item `duplicatedItemId` points at the same template, and takes its
   * customizations when it isn't a template itself; a template's copies get their properties from the template.
   */
  private async addRulesetItem(session: Session, rulesetId: string, body: ItemBody, duplicatedItemId?: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const source = duplicatedItemId
          ? findScopedEntity(
              rulesetData.itemsById,
              duplicatedItemId,
              rulesetId,
              rulesetData.cow.sourceChain,
              "Source item",
            )
          : undefined;
        if (!source) this.validateTemplateSource(body.isTemplate ?? false, body.sourceItemId);

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const { tombstoneAncestorId } = await edit.assertNameAvailable(tx, "items", body.name);

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        const rows = await Items.create(tx, {
          name: body.name,
          description: body.description,
          type: body.type,
          slot: hooks.items.resolveSlot(body.type, body.slot),
          rulesetId,
          weight: body.weight?.toString(),
          costGp: body.costGp?.toString(),
          sourceItemId: source ? this.templateOf(source) : body.sourceItemId,
          isTemplate: source ? false : (body.isTemplate ?? false),
        });
        const item = rows[0];

        if (tombstoneAncestorId) {
          await edit.repointTombstone(tx, "items", tombstoneAncestorId, item.id);
        }

        if (source && !source.isTemplate) {
          const cust = (await fetchEntityCustomizations(tx, [source.id], "items", "items")).get(source.id);
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
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async createItem(session: Session, rulesetId: string, body: ItemBody) {
    return await this.addRulesetItem(session, rulesetId, body);
  }

  async deleteItem(session: Session, rulesetId: string, itemId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await hasCharacterPicks(tx, "items", itemId, rulesetId);
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

        const item = findScopedEntity(rulesetData.itemsById, itemId, rulesetId, sourceChain, "Item");

        // If template, check for copies using the resolved ID
        if (item.isTemplate) {
          const copies = await Items.findMany(tx, { sourceItemId: item.id });
          if (copies.length > 0) {
            throw new ConflictError("Cannot delete a template item that has copies referencing it");
          }
        }

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
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async duplicateItem(session: Session, rulesetId: string, sourceItemId: string, body: ItemBody) {
    return await this.addRulesetItem(session, rulesetId, body, sourceItemId);
  }

  async getItem(rulesetId: string, itemId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const item = findScopedEntity(rulesetData.itemsById, itemId, rulesetId, sourceChain, "Item");

      // Template inheritance: if item has a sourceItemId, inherit properties and
      // requirements from the template. Own properties override template ones of
      // the same type; requirements are additive.
      const modifiers = rulesetData.modifiersBySource.get(item.id) ?? [];
      const ownProperties = rulesetData.propertiesByEntity.get(item.id) ?? [];
      const ownRequirements = rulesetData.requirementsByEntity.get(item.id) ?? [];
      const templateProperties = item.sourceItemId ? (rulesetData.propertiesByEntity.get(item.sourceItemId) ?? []) : [];
      const templateRequirements = item.sourceItemId
        ? (rulesetData.requirementsByEntity.get(item.sourceItemId) ?? [])
        : [];

      const ownPropertyTypes = new Set(ownProperties.map((p) => p.type));
      const properties = [...templateProperties.filter((p) => !ownPropertyTypes.has(p.type)), ...ownProperties];
      const requirements = [...templateRequirements, ...ownRequirements];

      return { ...item, modifiers, properties, requirements };
    });
  }

  async getItems(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      isTemplate?: boolean;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const result = await Items.findPage(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);

      return {
        ...result,
        items: result.items.map((item) => ({
          ...item,
          templateName: item.sourceItemId ? (rulesetData.itemsById.get(item.sourceItemId)?.name ?? null) : null,
        })),
      };
    });
  }

  async updateItem(session: Session, rulesetId: string, itemId: string, body: ItemBody) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const item = findScopedEntity(rulesetData.itemsById, itemId, rulesetId, sourceChain, "Item");

        this.validateTemplateSource(item.isTemplate, body.sourceItemId);

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const { id: targetId, copied } = await edit.cowToEdit(tx, "items", item);
        const expectedUpdatedAt = copied ? undefined : body.updatedAt;

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        const slot = hooks.items.resolveSlot(body.type, body.slot);
        const rows = await Items.update(
          tx,
          {
            name: body.name,
            description: body.description,
            type: body.type,
            slot,
            weight: body.weight?.toString(),
            costGp: body.costGp?.toString(),
            sourceItemId: item.isTemplate ? null : body.sourceItemId,
          },
          { id: targetId, expectedUpdatedAt },
        );
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
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
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new ItemsService();
