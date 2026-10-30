import { Engine } from "@/engine/index.ts";
import { CowDataReader, EntityNames, EntityRevert, RulesetViews } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError } from "@/server/errors/index.ts";
import {
  EntitySnapshots,
  RULESET_ENTITY_TYPES,
  RulesetEntities,
  type RulesetEntityType,
  Rulesets,
} from "@/server/repositories/index.ts";
import { getReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import type { Session } from "@/shared/relations.ts";

class RulesetChangesService {
  async getChanges(session: Session, rulesetId: string) {
    const { policy, ruleset } = await getReadableRuleset(db, session, rulesetId);
    policy.canViewChanges();

    if (!ruleset.rulesetId) throw new BadRequestError("Only forked rulesets have local changes");

    // The fork's own entities, and the snapshots of those it copied: a copy is a change to what it copied, the rest are
    // its own additions
    const snapshots = await EntitySnapshots.findMany(db, { rulesetId });
    const local = await RulesetEntities.findNames(db, { rulesetId });
    const localById = new Map(local.map((row) => [row.id, row]));
    const copied = new Set(snapshots.map((snap) => snap.forkedEntityId));
    // A deleted copy (a tombstone) lists its source by its name; a snapshot whose copy and source are both gone stands
    // for no entity, and lists no change
    const tombstones = snapshots.filter((snap) => !localById.has(snap.forkedEntityId));
    const sources = await RulesetEntities.findNames(db, { ids: tombstones.map((snap) => snap.sourceEntityId) });
    const sourceById = new Map(sources.map((row) => [row.id, row]));

    type ChangeRow =
      | { entityId: string; entityType: RulesetEntityType; name: string; sourceEntityId: string; status: "modified" }
      | { entityType: RulesetEntityType; name: string; sourceEntityId: string; status: "deleted" }
      | { entityId: string; entityType: RulesetEntityType; name: string; status: "added" };

    const changes: ChangeRow[] = local.flatMap(({ entityType, id, name }) =>
      copied.has(id) ? [] : [{ entityType, status: "added" as const, entityId: id, name }],
    );
    // A read-only kind (3.5's abilities) has no snapshots: no route edits it
    const restorable = Engine.rules().restorableKinds();
    for (const snap of snapshots) {
      const forked = localById.get(snap.forkedEntityId);
      const source = sourceById.get(snap.sourceEntityId);
      if (forked && restorable.includes(forked.entityType)) {
        changes.push({
          entityType: forked.entityType,
          status: "modified",
          sourceEntityId: snap.sourceEntityId,
          entityId: forked.id,
          name: forked.name,
        });
      } else if (!forked && source && restorable.includes(source.entityType)) {
        changes.push({
          entityType: source.entityType,
          status: "deleted",
          sourceEntityId: snap.sourceEntityId,
          name: source.name,
        });
      }
    }

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
