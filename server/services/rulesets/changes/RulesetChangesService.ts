import { Engine } from "@/engine/index.ts";
import { CowDataReader, EntityNames, EntityRevert, RulesetChanges, RulesetViews } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError } from "@/server/errors/index.ts";
import { RULESET_ENTITY_TYPES, type RulesetEntityType, Rulesets } from "@/server/repositories/index.ts";
import { getReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import type { Session } from "@/shared/relations.ts";

class RulesetChangesService {
  async getChanges(session: Session, rulesetId: string) {
    const { policy, ruleset } = await getReadableRuleset(db, session, rulesetId);
    policy.canViewChanges();

    if (!ruleset.rulesetId) throw new BadRequestError("Only forked rulesets have local changes");

    // Its changes as copy-on-write reads its snapshots, of the kinds a restore brings back (a read-only kind, 3.5's
    // abilities, has no snapshots: no route edits it)
    const { added, deleted, modified } = await RulesetChanges.read(db, rulesetId);
    const restorable = Engine.rules().restorableKinds();
    const changes = [
      ...added.map(({ entityType, id, name }) => ({ entityType, status: "added" as const, entityId: id, name })),
      ...modified
        .filter(({ entityType }) => restorable.includes(entityType))
        .map(({ entityType, id, name, sourceEntityId }) => ({
          entityType,
          status: "modified" as const,
          sourceEntityId,
          entityId: id,
          name,
        })),
      ...deleted
        .filter(({ entityType }) => restorable.includes(entityType))
        .map(({ entityType, name, sourceEntityId }) => ({
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
    const subscribers = await withTransaction(async (tx) => {
      const { policy } = await getReadableRuleset(tx, session, rulesetId);
      policy.canUpdateEntity();

      // The parent's entity shows again: under a name its view shows no other entity of
      const sources = (await Rulesets.findSources(tx, { id: rulesetId }))!;
      const names = new EntityNames(sources, await CowDataReader.read(tx, sources));
      await EntityRevert.revert(tx, entityType, entityId, rulesetId, names);
      // The rulesets built on it, whose rows may have named the copy: its subscribers, when it's an extension
      return await Rulesets.findMany(tx, { subscribedTo: rulesetId });
    });

    for (const id of [rulesetId, ...subscribers.map((subscriber) => subscriber.id)]) RulesetViews.invalidate(id);
    return { restored: true };
  }
}

export default new RulesetChangesService();
