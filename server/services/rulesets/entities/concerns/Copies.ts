import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { CustomizationCopies, EntityNames, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { CUSTOMIZABLE_TYPES, Entities, type RulesetEntityType } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { EntityRow } from "@/server/services/rulesets/entities/rows.ts";
import { getActivityName } from "@/shared/activity.ts";
import type { Session } from "@/shared/relations.ts";

/** A copy's own name and description. */
export interface VariantBody {
  description?: string | null;
  name: string;
}

/**
 * A kind's copies, as its rules plan them (an item's): the entities of a type others are made from (its templates), and
 * the copies of an entity made in bulk (its variants). A kind that makes none its rules refuse as not found.
 */
export function Copies<B extends Constructor>(Base: B) {
  abstract class WithCopies extends Base {
    /**
     * Copies of an entity (`sourceId`), each its own name and description (`variants`), as its kind's rules plan them:
     * each name kept free, as a create's is, each copy taking over a deleted ancestor's tombstone by its name, and the
     * customizations its plan copies.
     */
    async createVariants(
      session: Session,
      rulesetId: string,
      type: RulesetEntityType,
      sourceId: string,
      variants: VariantBody[],
    ) {
      const result = await withTransaction(
        async (tx) =>
          await withRulesetScope(tx, rulesetId, async (scope) => {
            const { ruleset, rulesetData } = scope;

            // Refused first, for a kind that makes no copies
            const kind = Engine.for(scope).entities(type, "variants");
            (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();
            const plan = kind.planVariants(sourceId, variants);
            // Every variant's name kept free, as a create's is, in one read: the tombstones they take over, by name
            const names = new EntityNames(ruleset, rulesetData.cow);
            const tombstones = await names.assertNamesAvailable(
              tx,
              type,
              variants.map((variant) => variant.name),
            );

            const copiedFrom = plan.copyCustomizationsFrom;
            const sourceType = CUSTOMIZABLE_TYPES.includes(type) ? type : undefined;
            const customizations = copiedFrom
              ? (await CustomizationCopies.read(tx, [copiedFrom], type, sourceType)).get(copiedFrom)
              : undefined;

            const created = [];
            for (const row of plan.rows) {
              const [copy] = await Entities.create<EntityRow>(tx, type, { ...row, rulesetId });
              const tombstoneAncestorId = tombstones.get(copy.name);
              if (tombstoneAncestorId) await names.repointTombstone(tx, type, tombstoneAncestorId, copy.id);

              await createActivityWithNotifications(tx, {
                userId: session.userId,
                targetId: copy.id,
                targetTable: type,
                type: `create${getActivityName(type)}`,
                data: { entityName: copy.name },
              });

              created.push(copy);
            }

            if (customizations) {
              await CustomizationCopies.copyToMany(
                tx,
                created.map((copy) => copy.id),
                type,
                customizations,
              );
            }

            return created;
          }),
      );
      RulesetViews.invalidate(rulesetId);
      return result;
    }

    /** The entities of a type others are made from (`templateType`: an item's templates of a type), by name. */
    async getTemplates<R = EntityRow>(rulesetId: string, type: RulesetEntityType, templateType?: string) {
      return await withRulesetScope(db, rulesetId, async (scope) => {
        const { rulesetData } = scope;
        const { filters } = Engine.for(scope).entities(type).openTemplates(templateType);
        return await Entities.findList<R & EntityRow>(db, {
          entityType: type,
          rulesetId,
          ...rulesetData.cow.listFilters,
          ...filters,
          order: "name",
        });
      });
    }
  }
  return WithCopies;
}
