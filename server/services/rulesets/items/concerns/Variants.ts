import { getTableName } from "drizzle-orm";

import { itemsInRules } from "@/drizzle/schema.ts";
import { planItemVariants } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { copyEntityCustomizationsToMany, fetchEntityCustomizations, RulesetEdit } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Items } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { TemplateItemType } from "@/shared/itemTemplates.ts";
import type { Session } from "@/shared/relations.ts";

/** An item's templates and their variants: what a variant may copy, and the variants made in bulk. */
export function Variants<B extends Constructor>(Base: B) {
  abstract class WithVariants extends Base {
    /**
     * The tombstoned ancestor each variant takes over, by the variant's index. When two tombstoned ancestors share a name
     * (an extension and a parent), the closer one (lower sourceChain index) follows the new item, matching the
     * sequential `RulesetEdit.assertNameAvailable` semantics.
     */
    protected variantTombstones(
      variants: Array<{ name: string }>,
      ancestorConflicts: Array<{ id: string; name: string; rulesetId: string }>,
      tombstoned: ReadonlySet<string>,
      sourceChain: string[],
    ) {
      const sourceChainOrder = new Map(sourceChain.map((id, i) => [id, i]));
      const tombstoneByName = new Map<string, (typeof ancestorConflicts)[number]>();
      for (const c of ancestorConflicts) {
        if (!tombstoned.has(c.id)) continue;
        const existing = tombstoneByName.get(c.name);
        if (
          !existing ||
          (sourceChainOrder.get(c.rulesetId) ?? Infinity) < (sourceChainOrder.get(existing.rulesetId) ?? Infinity)
        )
          tombstoneByName.set(c.name, c);
      }
      const tombstones = new Map<number, string>();
      for (let i = 0; i < variants.length; i++) {
        const ancestor = tombstoneByName.get(variants[i].name);
        if (ancestor) tombstones.set(i, ancestor.id);
      }
      return tombstones;
    }

    async createVariants(
      session: Session,
      rulesetId: string,
      sourceItemId: string,
      variants: Array<{ description?: string | null; name: string }>,
    ) {
      const names = variants.map((v) => v.name);
      const result = await withTransaction(
        async (tx) =>
          await withRulesetScope(tx, rulesetId, async (scope) => {
            const { ruleset, rulesetData } = scope;
            const { sourceChain } = rulesetData.cow;

            (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();
            const plan = planItemVariants(scope, sourceItemId, variants);

            // Batched pre-validation: one query for local conflicts, one for
            // ancestor conflicts, then the shared visibility / tombstone check
            // used by `RulesetEdit.assertNameAvailable`. Avoids N × sourceChain serial
            // round-trips when N can be up to 50.
            const ownConflicts = await Items.findMany(tx, { rulesetIds: [rulesetId], names });
            if (ownConflicts.length > 0)
              throw new ConflictError(`Name already exists in this ruleset: ${ownConflicts[0].name}`);

            const ancestorConflicts = await Items.findMany(tx, { rulesetIds: sourceChain, names });
            const edit = new RulesetEdit(ruleset, rulesetData.cow);
            const tombstoned = await edit.assertAncestorNamesHidden(
              tx,
              "items",
              ancestorConflicts.map((c) => c.id),
            );

            const tombstones = this.variantTombstones(variants, ancestorConflicts, tombstoned, sourceChain);

            const sourceId = plan.copyCustomizationsFrom;
            const sourceCust = sourceId
              ? (await fetchEntityCustomizations(tx, [sourceId], "items", "items")).get(sourceId)
              : undefined;

            const created = [];
            for (const [i, row] of plan.rows.entries()) {
              const rows = await Items.create(tx, { ...row, rulesetId });
              const item = rows[0];

              const tombstoneAncestorId = tombstones.get(i);
              if (tombstoneAncestorId) await edit.repointTombstone(tx, "items", tombstoneAncestorId, item.id);

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
          }),
      );
      RulesetCache.invalidate(rulesetId);
      return result;
    }

    async getTemplates(rulesetId: string, type?: TemplateItemType) {
      return await withRulesetScope(db, rulesetId, async (scope) => {
        const { rulesetData } = scope;
        const { sourceChain } = rulesetData.cow;
        return await Items.findMany(db, { rulesetId, ancestorRulesetIds: sourceChain, type, isTemplate: true });
      });
    }
  }
  return WithVariants;
}
