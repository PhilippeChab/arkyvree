import { itemsInRules, type location } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { inArray } from "drizzle-orm";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE, UnprocessableEntityError } from "@/server/errors/index.ts";
import { EntitySnapshots, Items } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import BaseService from "@/server/services/BaseService.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activityNotifications.ts";
import {
  assertEntityNameAvailable,
  copyEntityCustomizations,
  copyEntityCustomizationsToMany,
  cowEntity,
  deleteModifiersWithCascade,
  deletePropertiesWithCascade,
  deleteRequirementsWithCascade,
  entityHasCharacterPicks,
  fetchEntityCustomizations,
  repointTombstoneSnapshot,
  withRulesetScope,
} from "@/server/services/rulesets/cow.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import type { Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";

interface ItemBody {
  name: string;
  description?: string | null;
  weight?: number;
  costGp?: number;
  type?: string | null;
  slot?: (typeof location.enumValues)[number];
  sourceItemId?: string;
  isTemplate?: boolean;
  updatedAt?: string;
}

export const ItemsMethods = {
  async getRulesetItems(
    rulesetId: string,
    where: { childOnly?: boolean; isTemplate?: boolean; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const result = await Items.findManyByRulesetId(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);

      const sourceIds = [...new Set(result.items.map((i) => i.sourceItemId).filter(Boolean))] as string[];
      const templateMap = sourceIds.length > 0
        ? new Map(
            (await db.query.itemsInRules.findMany({
              where: inArray(itemsInRules.id, sourceIds),
              columns: { id: true, name: true },
            })).map((t) => [t.id, t.name]),
          )
        : null;

      return {
        ...result,
        items: result.items.map((item) => ({
          ...item,
          templateName: item.sourceItemId && templateMap ? templateMap.get(item.sourceItemId) ?? null : null,
        })),
      };
    });
  },

  async getRulesetItem(rulesetId: string, itemId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const item = rulesetData.itemsById.get(itemId);
      if (!item || (item.rulesetId !== rulesetId && !sourceChain.includes(item.rulesetId))) {
        throw new NotFoundError("Item not found in this ruleset");
      }

      // Template inheritance: if item has a sourceItemId, inherit properties and
      // requirements from the template. Own properties override template ones of
      // the same type; requirements are additive.
      const modifiers = rulesetData.modifiersBySource.get(item.id) ?? [];
      const ownProperties = rulesetData.propertiesByEntity.get(item.id) ?? [];
      const ownRequirements = rulesetData.requirementsByEntity.get(item.id) ?? [];
      const templateProperties = item.sourceItemId
        ? rulesetData.propertiesByEntity.get(item.sourceItemId) ?? []
        : [];
      const templateRequirements = item.sourceItemId
        ? rulesetData.requirementsByEntity.get(item.sourceItemId) ?? []
        : [];

      const ownPropertyTypes = new Set(ownProperties.map((p) => p.type));
      const properties = [
        ...templateProperties.filter((p) => !ownPropertyTypes.has(p.type)),
        ...ownProperties,
      ];
      const requirements = [...templateRequirements, ...ownRequirements];

      return { ...item, modifiers, properties, requirements };
    });
  },

  async getRulesetTemplates(rulesetId: string, type?: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      return await Items.findTemplates(db, { rulesetId, ancestorRulesetIds: sourceChain, type });
    });
  },

  async createRulesetItem(session: Session, rulesetId: string, body: ItemBody) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const { tombstoneAncestorId } = await assertEntityNameAvailable(tx, rulesetId, sourceChain, "items", body.name);

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        const slot = hooks.items.resolveSlot(body.type, body.slot);
        const rows = await Items.create(tx, {
          name: body.name,
          description: body.description,
          type: body.type,
          slot,
          rulesetId,
          weight: body.weight?.toString(),
          costGp: body.costGp?.toString(),
          sourceItemId: body.sourceItemId,
          isTemplate: body.isTemplate ?? false,
        });
        const item = rows[0];

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

        return item;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async duplicateRulesetItem(session: Session, rulesetId: string, sourceItemId: string, body: ItemBody) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const sourceItem = rulesetData.itemsById.get(sourceItemId);
        if (!sourceItem || (sourceItem.rulesetId !== rulesetId && !sourceChain.includes(sourceItem.rulesetId))) {
          throw new NotFoundError("Source item not found in this ruleset");
        }

        const { tombstoneAncestorId } = await assertEntityNameAvailable(tx, rulesetId, sourceChain, "items", body.name);

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        const slot = hooks.items.resolveSlot(body.type, body.slot);
        const rows = await Items.create(tx, {
          name: body.name,
          description: body.description,
          type: body.type,
          slot,
          rulesetId,
          weight: body.weight?.toString(),
          costGp: body.costGp?.toString(),
          sourceItemId: sourceItem.isTemplate ? sourceItem.id : sourceItem.sourceItemId ?? undefined,
          isTemplate: false,
        });
        const item = rows[0];

        if (tombstoneAncestorId) {
          await repointTombstoneSnapshot(tx, rulesetId, "items", tombstoneAncestorId, item.id);
        }

        if (!sourceItem.isTemplate) {
          const custMap = await fetchEntityCustomizations(tx, [sourceItemId], "items", "items");
          const cust = custMap.get(sourceItemId);
          if (cust) {
            await copyEntityCustomizations(tx, sourceItemId, item.id, "items", cust);
          }
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
  },

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

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const source = rulesetData.itemsById.get(sourceItemId);
        if (!source || (source.rulesetId !== rulesetId && !sourceChain.includes(source.rulesetId))) {
          throw new NotFoundError("Source item not found in this ruleset");
        }

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        const slot = hooks.items.resolveSlot(source.type, source.slot);

        // Batched pre-validation: one query for local conflicts, one for
        // ancestor conflicts, one for the tombstone snapshots that excuse
        // an ancestor match. Avoids N × sourceChain serial round-trips
        // when N can be up to 50.
        const ownConflicts = await Items.findByNamesInRulesets(tx, { rulesetIds: [rulesetId], names });
        if (ownConflicts.length > 0) {
          throw new ConflictError(`Name already exists in this ruleset: ${ownConflicts[0].name}`);
        }

        const ancestorConflicts = await Items.findByNamesInRulesets(tx, { rulesetIds: sourceChain, names });
        const snapshots = ancestorConflicts.length > 0
          ? await EntitySnapshots.findManyBySourcesAndRuleset(tx, {
              sourceEntityIds: ancestorConflicts.map((c) => c.id),
              rulesetId,
            })
          : [];
        const snapshotAncestorIds = new Set(snapshots.map((s) => s.sourceEntityId));

        // Preserve sourceChain order: when two ancestors expose an item with
        // the same name (e.g. an extension and a parent), the closer one
        // (lower sourceChain index) is the visible conflict, matching the
        // sequential `assertEntityNameAvailable` semantics.
        const sourceChainOrder = new Map(sourceChain.map((id, i) => [id, i]));
        const ancestorByName = new Map<string, (typeof ancestorConflicts)[number]>();
        for (const c of ancestorConflicts) {
          const existing = ancestorByName.get(c.name);
          if (!existing || (sourceChainOrder.get(c.rulesetId) ?? Infinity) < (sourceChainOrder.get(existing.rulesetId) ?? Infinity)) {
            ancestorByName.set(c.name, c);
          }
        }
        const tombstones = new Map<number, string>();
        for (let i = 0; i < variants.length; i++) {
          const ancestor = ancestorByName.get(variants[i].name);
          if (!ancestor) continue;
          if (!snapshotAncestorIds.has(ancestor.id)) {
            throw new ConflictError("Name already exists in the source chain (an ancestor or subscribed extension)");
          }
          tombstones.set(i, ancestor.id);
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
            sourceItemId: source.isTemplate ? source.id : source.sourceItemId ?? undefined,
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
          await copyEntityCustomizationsToMany(tx, created.map((c) => c.id), "items", sourceCust);
        }

        return created;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async updateRulesetItem(session: Session, rulesetId: string, itemId: string, body: ItemBody) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const item = rulesetData.itemsById.get(itemId);
        const isOwned = item && item.rulesetId === rulesetId;
        const isInherited = item && sourceChain.includes(item.rulesetId);
        if (!item || (!isOwned && !isInherited)) {
          throw new NotFoundError("Item not found in this ruleset");
        }

        let targetId = item.id;
        const expectedUpdatedAt = isOwned ? body.updatedAt : undefined;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "items", item.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        const slot = hooks.items.resolveSlot(body.type, body.slot);
        const rows = await Items.update(tx, {
          name: body.name,
          description: body.description,
          type: body.type,
          slot,
          weight: body.weight?.toString(),
          costGp: body.costGp?.toString(),
          sourceItemId: body.sourceItemId,
        }, { id: targetId, expectedUpdatedAt });
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
        const updatedItem = rows[0];

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId,
          targetTable: getTableName(itemsInRules),
          type: "updateItem",
          data: { entityName: body.name, changedFields: getChangedFields(item as Record<string, unknown>, body as unknown as Record<string, unknown>) },
        });

        return updatedItem;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async deleteRulesetItem(session: Session, rulesetId: string, itemId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await entityHasCharacterPicks(tx, "items", itemId, rulesetId);
        (await getRulesetPolicy(tx, session, ruleset)).canDeleteEntity({ inUse });

        const item = rulesetData.itemsById.get(itemId);
        const isOwned = item && item.rulesetId === rulesetId;
        const isInherited = item && sourceChain.includes(item.rulesetId);
        if (!item || (!isOwned && !isInherited)) {
          throw new NotFoundError("Item not found in this ruleset");
        }

        // If template, check for copies using the resolved ID
        if (item.isTemplate) {
          const copies = await Items.findCopies(tx, { sourceItemId: item.id });
          if (copies.length > 0) {
            throw new ConflictError("Cannot delete a template item that has copies referencing it");
          }
        }

        let targetId = item.id;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "items", item.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

        // Customizations are polymorphic FKs — Postgres can't cascade these.
        await deleteRequirementsWithCascade(tx, { entityIds: [targetId], entityType: "items" });
        await deletePropertiesWithCascade(tx, { entityIds: [targetId], entityType: "items" });
        await deleteModifiersWithCascade(tx, { sourceIds: [targetId], sourceType: "items" });

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
  },
} as const;

class ItemsService extends BaseService<typeof ItemsMethods> {
  static initialize() {
    return new ItemsService(ItemsMethods);
  }
}

export default ItemsService;
