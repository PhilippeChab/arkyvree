import { getTableName } from "drizzle-orm";

import { itemsInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { CustomizationCopies, EntityNames, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { Items } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

/** An item's templates and their variants: what a variant may copy, and the variants made in bulk. */
export function Variants<B extends Constructor>(Base: B) {
  abstract class WithVariants extends Base {
    async createVariants(
      session: Session,
      rulesetId: string,
      sourceItemId: string,
      variants: Array<{ description?: string | null; name: string }>,
    ) {
      const result = await withTransaction(
        async (tx) =>
          await withRulesetScope(tx, rulesetId, async (scope) => {
            const { ruleset, rulesetData } = scope;

            (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();
            const plan = Engine.for(scope).entities("items").planVariants(sourceItemId, variants);
            // Every variant's name kept free, as a create's is, in one read: the tombstones they take over, by name
            const names = new EntityNames(ruleset, rulesetData.cow);
            const tombstones = await names.assertNamesAvailable(
              tx,
              "items",
              variants.map((variant) => variant.name),
            );

            const sourceId = plan.copyCustomizationsFrom;
            const sourceCust = sourceId
              ? (await CustomizationCopies.read(tx, [sourceId], "items", "items")).get(sourceId)
              : undefined;

            const created = [];
            for (const row of plan.rows) {
              const [item] = await Items.create(tx, { ...row, rulesetId });
              const tombstoneAncestorId = tombstones.get(item.name);
              if (tombstoneAncestorId) await names.repointTombstone(tx, "items", tombstoneAncestorId, item.id);

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
              await CustomizationCopies.copyToMany(
                tx,
                created.map((c) => c.id),
                "items",
                sourceCust,
              );
            }

            return created;
          }),
      );
      RulesetViews.invalidate(rulesetId);
      return result;
    }

    async getTemplates(rulesetId: string, type?: string) {
      return await withRulesetScope(db, rulesetId, async (scope) => {
        const { rulesetData } = scope;
        const { filters } = Engine.for(scope).entities("items").openTemplates(type);
        return await Items.findMany(db, { rulesetId, ...rulesetData.cow.listFilters, ...filters });
      });
    }
  }
  return WithVariants;
}
