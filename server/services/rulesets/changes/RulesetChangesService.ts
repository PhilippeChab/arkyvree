import { Engine } from "@/engine/index.ts";
import { EntityNames, EntityRevert, RulesetChanges, RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { type RulesetEntityType, Rulesets } from "@/server/repositories/index.ts";
import { getReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import { withRulesetWrite } from "@/server/services/writes/index.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import type { Session } from "@/shared/relations.ts";

class RulesetChangesService {
  async getChanges(session: Session, rulesetId: string) {
    const { policy, ruleset } = await getReadableRuleset(db, session, rulesetId);
    policy.canViewChanges();

    // Its changes as copy-on-write reads its snapshots, of the kinds a restore brings back
    const { added, deleted, modified } = await RulesetChanges.read(db, ruleset);
    const changes = [
      ...added.map(({ entityType, id, name }) => ({ entityType, status: "added" as const, entityId: id, name })),
      ...modified.map(({ entityType, id, name, sourceEntityId }) => ({
        entityType,
        status: "modified" as const,
        sourceEntityId,
        entityId: id,
        name,
      })),
      ...deleted.map(({ entityType, name, sourceEntityId }) => ({
        entityType,
        status: "deleted" as const,
        sourceEntityId,
        name,
      })),
    ];

    // One order, whatever the rows' storage: by kind, in its module's order, then by name
    const kinds = Engine.forRules(ruleset.baseRules).storage().standaloneKinds();
    return changes.toSorted(
      (a, b) => kinds.indexOf(a.entityType) - kinds.indexOf(b.entityType) || a.name.localeCompare(b.name),
    );
  }

  /**
   * Reverts the fork's copy of an inherited entity to its parent's (`EntityRevert`): what names the copy, the fork's
   * rows, its subscribers' and their characters', names the parent's entity again. Refused while the fork's view shows
   * another entity of the parent's entity's name (`EntityNames`), which it would show twice. A fork's alone, whose
   * changes these are (`canViewChanges`).
   */
  async revertOverride(session: Session, rulesetId: string, entityType: RulesetEntityType, entityId: string) {
    const subscribers = await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
      policy.canRevertChange();
      // Of a kind its own base rules restore: another's kind is none of its
      const { baseRules } = scope.ruleset;
      if (!isOneOf(entityType, Engine.rules().restorableKindsOf(baseRules)))
        throw new NotFoundError(Engine.rules().describeNotFound(baseRules, entityType));

      // The parent's entity shows again: under a name its view shows no other entity of
      const names = new EntityNames(scope);
      await EntityRevert.revert(tx, entityType, entityId, scope, names);
      // The rulesets built on it, whose rows may have named the copy: its subscribers, when it's an extension. Their
      // writes hold it shared, so none ran meanwhile, and its bumped version tells their views from their rows
      return await Rulesets.findMany(tx, { subscribedTo: rulesetId });
    });

    for (const subscriber of subscribers) RulesetViews.invalidate(subscriber.id);
    return { restored: true };
  }
}

export default new RulesetChangesService();
