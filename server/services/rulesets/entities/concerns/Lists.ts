import type { Db } from "@/drizzle/database.ts";
import { Engine, type ListEntriesPlan } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { LockedRulesetScope } from "@/server/cow/index.ts";
import type { RulesetEntityType } from "@/server/repositories/index.ts";
import { createContentActivityWithNotifications } from "@/server/services/activities/index.ts";
import type { RulesetsPolicy } from "@/server/services/policies/index.ts";
import EntityWriter from "@/server/services/rulesets/entities/EntityWriter.ts";
import { withRulesetWrite } from "@/server/services/writes/index.ts";
import { getActivityName } from "@/shared/activity.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * Writes what adding entities to an owner's list, or removing one from it, plans (`plan`): the list it makes, if any,
 * then each entity's edit (`EntityWriter.updateEntities`: an inherited one copied on its first edit), then one activity
 * for them all, named for the owner's kind and the kind listed (`addClassSpell`, `removeClassSpell`), its target the
 * owner. Answers the entities written, in the plan's order.
 */
async function writeEntries(
  tx: Db,
  session: Session,
  scope: LockedRulesetScope,
  policy: RulesetsPolicy,
  verb: "add" | "remove",
  type: RulesetEntityType,
  plan: ListEntriesPlan,
) {
  const written = await EntityWriter.updateEntities(tx, scope, policy, plan.listedType, plan.edits, plan.writes);
  await createContentActivityWithNotifications(tx, scope.ruleset, {
    userId: session.userId,
    targetId: plan.owner.id,
    targetType: type,
    type: `${verb}${getActivityName(type)}${getActivityName(plan.listedType)}`,
    data: plan.activity,
  });
  return written;
}

/**
 * The lists an entity's owned entities count entities on (a class's spell lists), as its kind's rules answer them
 * (`Engine.for(scope).lists(type, ownerId)`): adding entities to one at a tier, or removing one from it, each in one
 * transaction, every entity written or none, and recorded as one activity, and making the owner's own list with none.
 * The entities are written, not the owner.
 */
export function Lists<B extends Constructor>(Base: B) {
  abstract class WithLists extends Base {
    /**
     * Adds entities (`targetIds`) to one of an owner's lists (`listId`, of `ownerId`; none: its own list, made first
     * where the ruleset has none) at a tier (`tier`: a spell's level there), each keeping its other lists. Answers the
     * entities written: an inherited one's copy.
     */
    async addListedEntities(
      session: Session,
      rulesetId: string,
      type: RulesetEntityType,
      ownerId: string,
      listId: string | undefined,
      targetIds: string[],
      tier: number | undefined,
    ) {
      return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
        policy.canUpdateEntity();
        const plan = Engine.for(scope).lists(type, ownerId).planAdd(listId, targetIds, tier);
        return await writeEntries(tx, session, scope, policy, "add", type, plan);
      });
    }

    /**
     * Makes an owner's own list with no entries yet (`ownerId`'s: a class's "Barbarian Spells"), recorded as the list's
     * own create. Answers the list made: its id, its name and its kind.
     */
    async createOwnList(session: Session, rulesetId: string, type: RulesetEntityType, ownerId: string) {
      return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
        policy.canUpdateEntity();
        const plan = Engine.for(scope).lists(type, ownerId).planOwnList();
        await EntityWriter.updateEntities(tx, scope, policy, plan.created.type, [], plan.writes);
        await createContentActivityWithNotifications(tx, scope.ruleset, {
          userId: session.userId,
          targetId: plan.created.id,
          targetType: plan.created.type,
          type: `create${getActivityName(plan.created.type)}`,
          data: plan.activity,
        });
        return plan.created;
      });
    }

    /**
     * Removes an entity (`targetId`) from one of an owner's lists (`listId`, of `ownerId`), keeping its other lists.
     * Answers the entity written: an inherited one's copy.
     */
    async removeListedEntity(
      session: Session,
      rulesetId: string,
      type: RulesetEntityType,
      ownerId: string,
      listId: string,
      targetId: string,
    ) {
      return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
        policy.canUpdateEntity();
        const plan = Engine.for(scope).lists(type, ownerId).planRemove(listId, targetId);
        const [written] = await writeEntries(tx, session, scope, policy, "remove", type, plan);
        return written;
      });
    }
  }
  return WithLists;
}
