import { getTableName } from "drizzle-orm";

import { itemsInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Items } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import {
  assertAncestorNamesHidden,
  assertEntityNameAvailable,
  copyEntityCustomizations,
  copyEntityCustomizationsToMany,
  entityHasCharacterPicks,
  entityToDelete,
  entityToEdit,
  fetchEntityCustomizations,
  findScopedEntity,
  repointTombstoneSnapshot,
  withRulesetScope,
} from "@/server/services/rulesets/cow/index.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

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

class ItemsService {
  private validateTemplateSource(isTemplate: boolean, sourceItemId?: string) {
    if (isTemplate && sourceItemId) {
      throw new UnprocessableEntityError("Template items cannot have a source item");
    }
  }

  /** The template an item made from `item` points at: `item` itself when it's a template, or its own template. */
  private templateOf(item: { id: string; isTemplate: boolean; sourceItemId: string | null }) {
    return item.isTemplate ? item.id : (item.sourceItemId ?? undefined);
  }

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

        const { tombstoneAncestorId } = await assertEntityNameAvailable(
          tx,
          rulesetId,
          rulesetData.cow,
          "items",
          body.name,
        );

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
          await repointTombstoneSnapshot(tx, rulesetId, "items", tombstoneAncestorId, item.id);
        }

        if (source && !source.isTemplate) {
          const cust = (await fetchEntityCustomizations(tx, [source.id], "items", "items")).get(source.id);
          if (cust) await copyEntityCustomizations(tx, source.id, item.id, "items", cust);
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
    invalidateRuleset(rulesetId);
    return result;
  }

  async getRulesetItem(rulesetId: string, itemId: string) {
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

  async getRulesetItems(
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
      const result = await Items.findManyByRulesetId(
        db,
        { rulesetId, ancestorRulesetIds: sourceChain, ...where },
        pagination,
      );

      return {
        ...result,
        items: result.items.map((item) => ({
          ...item,
          templateName: item.sourceItemId ? (rulesetData.itemsById.get(item.sourceItemId)?.name ?? null) : null,
        })),
      };
    });
  }

  async getRulesetTemplates(rulesetId: string, type?: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      return await Items.findTemplates(db, { rulesetId, ancestorRulesetIds: sourceChain, type });
    });
  }

  async bulkCreateVariants(
    session: Session,
    rulesetId: string,
    sourceItemId: string,
    variants: Array<{ name: string; description?: string | null }>,
  ) {
    if (variants.length === 0) {
      throw new UnprocessableEntityError("At least one variant is required");
    }
    if (variants.length > 50) {
      throw new UnprocessableEntityError("Cannot create more than 50 variants at once");
    }
    const names = variants.map((v) => v.name);
    if (new Set(names).size !== names.length) {
      throw new ConflictError("Duplicate names within the variants list");
    }

    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const source = findScopedEntity(rulesetData.itemsById, sourceItemId, rulesetId, sourceChain, "Source item");

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        const slot = hooks.items.resolveSlot(source.type, source.slot);

        // Batched pre-validation: one query for local conflicts, one for
        // ancestor conflicts, then the shared visibility / tombstone check
        // used by `assertEntityNameAvailable`. Avoids N × sourceChain serial
        // round-trips when N can be up to 50.
        const ownConflicts = await Items.findByNamesInRulesets(tx, { rulesetIds: [rulesetId], names });
        if (ownConflicts.length > 0) {
          throw new ConflictError(`Name already exists in this ruleset: ${ownConflicts[0].name}`);
        }

        const ancestorConflicts = await Items.findByNamesInRulesets(tx, { rulesetIds: sourceChain, names });
        const tombstoned = await assertAncestorNamesHidden(
          tx,
          rulesetId,
          rulesetData.cow,
          "items",
          ancestorConflicts.map((c) => c.id),
        );

        // Preserve sourceChain order: when two tombstoned ancestors share a
        // name (e.g. an extension and a parent), the closer one (lower
        // sourceChain index) follows the new item, matching the sequential
        // `assertEntityNameAvailable` semantics.
        const sourceChainOrder = new Map(sourceChain.map((id, i) => [id, i]));
        const tombstoneByName = new Map<string, (typeof ancestorConflicts)[number]>();
        for (const c of ancestorConflicts) {
          if (!tombstoned.has(c.id)) continue;
          const existing = tombstoneByName.get(c.name);
          if (
            !existing ||
            (sourceChainOrder.get(c.rulesetId) ?? Infinity) < (sourceChainOrder.get(existing.rulesetId) ?? Infinity)
          ) {
            tombstoneByName.set(c.name, c);
          }
        }
        const tombstones = new Map<number, string>();
        for (let i = 0; i < variants.length; i++) {
          const ancestor = tombstoneByName.get(variants[i].name);
          if (ancestor) tombstones.set(i, ancestor.id);
        }

        const sourceCust = source.isTemplate
          ? undefined
          : (await fetchEntityCustomizations(tx, [source.id], "items", "items")).get(source.id);

        const created = [];
        for (let i = 0; i < variants.length; i++) {
          const variant = variants[i];
          const rows = await Items.create(tx, {
            name: variant.name,
            description: variant.description,
            type: source.type,
            slot,
            rulesetId,
            weight: source.weight,
            costGp: source.costGp,
            sourceItemId: this.templateOf(source),
            isTemplate: false,
          });
          const item = rows[0];

          const tombstoneAncestorId = tombstones.get(i);
          if (tombstoneAncestorId) {
            await repointTombstoneSnapshot(tx, rulesetId, "items", tombstoneAncestorId, item.id);
          }

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: item.id,
            targetTable: getTableName(itemsInRules),
            type: "createItem",
            data: { entityName: item.name },
          });

          created.push(item);
        }

        if (sourceCust) {
          await copyEntityCustomizationsToMany(
            tx,
            created.map((c) => c.id),
            "items",
            sourceCust,
          );
        }

        return created;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  }

  async createRulesetItem(session: Session, rulesetId: string, body: ItemBody) {
    return await this.addRulesetItem(session, rulesetId, body);
  }

  async duplicateRulesetItem(session: Session, rulesetId: string, sourceItemId: string, body: ItemBody) {
    return await this.addRulesetItem(session, rulesetId, body, sourceItemId);
  }

  async updateRulesetItem(session: Session, rulesetId: string, itemId: string, body: ItemBody) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const item = findScopedEntity(rulesetData.itemsById, itemId, rulesetId, sourceChain, "Item");

        this.validateTemplateSource(item.isTemplate, body.sourceItemId);

        const { id: targetId, copied } = await entityToEdit(tx, ruleset, sourceChain, "items", item);
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
    invalidateRuleset(rulesetId);
    return result;
  }

  async deleteRulesetItem(session: Session, rulesetId: string, itemId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await entityHasCharacterPicks(tx, "items", itemId, rulesetId);
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

        const item = findScopedEntity(rulesetData.itemsById, itemId, rulesetId, sourceChain, "Item");

        // If template, check for copies using the resolved ID
        if (item.isTemplate) {
          const copies = await Items.findCopies(tx, { sourceItemId: item.id });
          if (copies.length > 0) {
            throw new ConflictError("Cannot delete a template item that has copies referencing it");
          }
        }

        const targetId = await entityToDelete(tx, ruleset, sourceChain, "items", item);

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
    invalidateRuleset(rulesetId);
    return result;
  }
}

export default new ItemsService();
