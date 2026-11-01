import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { EntityEdit, EntityUses } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { EntityLinks, type RulesetEntityType } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { withReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import { withRulesetWrite } from "@/server/services/rulesets/rulesetWrites.ts";
import { getActivityName } from "@/shared/activity.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * The links of a role an entity's page edits one at a time (a class's skills), as its kind's rules answer them
 * (`Engine.for(scope).links(type, ownerId)`): their list, and their adds and removals, each written on the entity the
 * view's resolves to (its copy, made on its first edit) and recorded as an activity named for their role.
 */
export function Links<B extends Constructor>(Base: B) {
  abstract class WithLinks extends Base {
    /**
     * A link from an entity (`ownerId`) to another (`targetId`), of the role it edits: the entity copied when it's
     * inherited (the new link would otherwise be the source ruleset's). Answers the link written.
     */
    async addEntityLink(
      session: Session,
      rulesetId: string,
      type: RulesetEntityType,
      ownerId: string,
      targetId: string,
    ) {
      return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
        policy.canUpdateEntity();
        const plan = Engine.for(scope).links(type, ownerId).planAdd(targetId);
        const { id: fromId } = await new EntityEdit(scope).cowToEdit(tx, type, plan.owner);
        const [link] = await EntityLinks.createMany(tx, [{ ...plan.link, fromId, fromType: type }]);

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: fromId,
          targetType: plan.link.role,
          type: `add${getActivityName(plan.link.role)}`,
          data: plan.activity,
        });

        return link;
      });
    }

    /** The links an entity edits (`ownerId`), each with its target. */
    async getEntityLinks(session: Session, rulesetId: string, type: RulesetEntityType, ownerId: string) {
      return await withReadableRuleset(db, session, rulesetId, async (scope) =>
        Engine.for(scope).links(type, ownerId).describe(),
      );
    }

    /**
     * A link's removal from an entity (`ownerId`) to another (`targetId`): refused while a character names the entity,
     * which its link may count for, the entity copied when it's inherited (the removal would otherwise remove the
     * source ruleset's). Answers the link it removed.
     */
    async removeEntityLink(
      session: Session,
      rulesetId: string,
      type: RulesetEntityType,
      ownerId: string,
      targetId: string,
    ) {
      return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
        const inUse = await new EntityUses(scope).isPicked(tx, type, ownerId);
        policy.canDeleteEntity({ inUse });
        const plan = Engine.for(scope).links(type, ownerId).planRemove(targetId);
        const { id: fromId } = await new EntityEdit(scope).cowToEdit(tx, type, plan.owner);
        const [link] = await EntityLinks.delete(tx, { fromId, role: plan.role, toId: plan.toId });
        // The fresh view showed it, and no other write runs under the lock: a guard, should one have
        if (!link) throw new ConflictError(STALE_ENTITY_MESSAGE);

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: fromId,
          targetType: plan.role,
          type: `remove${getActivityName(plan.role)}`,
          data: plan.activity,
        });

        return link;
      });
    }
  }
  return WithLinks;
}
