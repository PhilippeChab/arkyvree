import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { EntityEdit, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { Joins, type RulesetEntityType } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { hasCharacterPicks } from "@/server/services/rulesets/characterPicks.ts";
import { getActivityName } from "@/shared/activity.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * The links an entity edits through a join (a class's skills), as its kind's rules answer them
 * (`Engine.for(scope).links(type, ownerId)`): their list, and their adds and removals, each written on the entity the view's
 * resolves to (its copy, made on its first edit) and recorded as the join's activity.
 */
export function Links<B extends Constructor>(Base: B) {
  abstract class WithLinks extends Base {
    /**
     * A link from an entity (`ownerId`) to another (`targetId`) through the join it edits: the entity copied when it's
     * inherited (the new row would otherwise name the source ruleset's). Answers the join's row.
     */
    async addEntityLink(
      session: Session,
      rulesetId: string,
      type: RulesetEntityType,
      ownerId: string,
      targetId: string,
    ) {
      const result = await withTransaction(
        async (tx) =>
          await withRulesetScope(tx, rulesetId, async (scope) => {
            const { ruleset } = scope;

            (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();
            const plan = Engine.for(scope).links(type, ownerId).planAdd(targetId);

            const { id: fromId } = await new EntityEdit(ruleset).cowToEdit(tx, type, plan.owner);
            const [row] = await Joins.createFrom<Record<string, unknown>>(tx, plan.join, fromId, [plan.row]);

            await createActivityWithNotifications(tx, {
              userId: session.userId,
              targetId: fromId,
              targetTable: plan.join,
              type: `add${getActivityName(plan.join)}`,
              data: plan.activity,
            });

            return row;
          }),
      );
      RulesetViews.invalidate(rulesetId);
      return result;
    }

    /** The links an entity edits (`ownerId`), each with its target. */
    async getEntityLinks(rulesetId: string, type: RulesetEntityType, ownerId: string) {
      return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).links(type, ownerId).describe());
    }

    /**
     * A link's removal from an entity (`ownerId`) to another (`targetId`): refused while a character names the entity,
     * which its link may count for, the entity copied when it's inherited (the removal would otherwise remove the source
     * ruleset's). Answers the join's row it removed.
     */
    async removeEntityLink(
      session: Session,
      rulesetId: string,
      type: RulesetEntityType,
      ownerId: string,
      targetId: string,
    ) {
      const result = await withTransaction(
        async (tx) =>
          await withRulesetScope(tx, rulesetId, async (scope) => {
            const { ruleset, rulesetData } = scope;

            const inUse = await hasCharacterPicks(tx, type, rulesetData.cow.getEquivalentIds(ownerId), rulesetId);
            (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });
            const plan = Engine.for(scope).links(type, ownerId).planRemove(targetId);

            const { id: fromId } = await new EntityEdit(ruleset).cowToEdit(tx, type, plan.owner);
            const [row] = await Joins.delete<Record<string, unknown>>(tx, { join: plan.join, fromId, toId: plan.toId });

            await createActivityWithNotifications(tx, {
              userId: session.userId,
              targetId: fromId,
              targetTable: plan.join,
              type: `remove${getActivityName(plan.join)}`,
              data: plan.activity,
            });

            return row;
          }),
      );
      RulesetViews.invalidate(rulesetId);
      return result;
    }
  }
  return WithLinks;
}
