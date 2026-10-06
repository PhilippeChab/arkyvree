import { getTableName } from "drizzle-orm";

import { itemsInRules } from "@/drizzle/schema.ts";
import { findScopedEntity, RulesetCache } from "@/server/cache/rulesetCache/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { copyEntityCustomizationsToMany, fetchEntityCustomizations, RulesetEdit } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, UnprocessableEntityError } from "@/server/errors/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import { Items } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

/** An item's templates and their variants: what a variant may copy, and the variants made in bulk. */
export function Variants<B extends Constructor>(Base: B) {
  abstract class WithVariants extends Base {
    /** The template an item made from `item` points at: `item` itself when it's a template, or its own template. */
    protected templateOf(item: { id: string; isTemplate: boolean; sourceItemId: string | null }) {
      return item.isTemplate ? item.id : (item.sourceItemId ?? undefined);
    }

    protected validateTemplateSource(isTemplate: boolean, sourceItemId?: string) {
      if (isTemplate && sourceItemId) {
        throw new UnprocessableEntityError("Template items cannot have a source item");
      }
    }

    async createVariants(
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
          // used by `RulesetEdit.assertNameAvailable`. Avoids N × sourceChain serial
          // round-trips when N can be up to 50.
          const ownConflicts = await Items.findMany(tx, { rulesetIds: [rulesetId], names });
          if (ownConflicts.length > 0) {
            throw new ConflictError(`Name already exists in this ruleset: ${ownConflicts[0].name}`);
          }

          const ancestorConflicts = await Items.findMany(tx, { rulesetIds: sourceChain, names });
          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const tombstoned = await edit.assertAncestorNamesHidden(
            tx,
            "items",
            ancestorConflicts.map((c) => c.id),
          );

          // Preserve sourceChain order: when two tombstoned ancestors share a
          // name (e.g. an extension and a parent), the closer one (lower
          // sourceChain index) follows the new item, matching the sequential
          // `RulesetEdit.assertNameAvailable` semantics.
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
              await edit.repointTombstone(tx, "items", tombstoneAncestorId, item.id);
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
      RulesetCache.invalidate(rulesetId);
      return result;
    }

    async getTemplates(rulesetId: string, type?: string) {
      return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
        const { sourceChain } = rulesetData.cow;
        return await Items.findMany(db, { rulesetId, ancestorRulesetIds: sourceChain, type, isTemplate: true });
      });
    }
  }
  return WithVariants;
}
