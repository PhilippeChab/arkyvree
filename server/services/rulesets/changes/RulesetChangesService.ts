import { EntityNames, EntityRevert, RulesetChanges, RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { BadRequestError } from "@/server/errors/index.ts";
import { RULESET_ENTITY_TYPES, type RulesetEntityType, Rulesets } from "@/server/repositories/index.ts";
import { getReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import { withRulesetWrite } from "@/server/services/rulesets/rulesetWrites.ts";
import type { Session } from "@/shared/relations.ts";

class RulesetChangesService {
  async getChanges(session: Session, rulesetId: string) {
    const { policy, ruleset } = await getReadableRuleset(db, session, rulesetId);
    policy.canViewChanges();

    if (!ruleset.rulesetId) throw new BadRequestError("Only forked rulesets have local changes");

    // Its changes as copy-on-write reads its snapshots, of the kinds a restore brings back
    const { added, deleted, modified } = await RulesetChanges.read(db, rulesetId);
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

    // One order, whatever the rows' storage: by kind, in the modules' order, then by name
    return changes.toSorted(
      (a, b) =>
        RULESET_ENTITY_TYPES.indexOf(a.entityType) - RULESET_ENTITY_TYPES.indexOf(b.entityType) ||
        a.name.localeCompare(b.name),
    );
  }

  /**
   * Reverts the fork's copy of an inherited entity to its parent's (`EntityRevert`): what names the copy, the fork's
   * rows, its subscribers' and their characters', names the parent's entity again. Refused while the fork's view shows
   * another entity of the parent's entity's name (`EntityNames`), which it would show twice.
   */
  async revertOverride(session: Session, rulesetId: string, entityType: RulesetEntityType, entityId: string) {
    const subscribers = await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
      policy.canUpdateEntity();

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
