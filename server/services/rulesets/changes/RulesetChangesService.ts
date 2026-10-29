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

    const snapshots = await EntitySnapshots.findManyWithEntities(db, { rulesetId });

    // Group snapshots by entity type for batch fetching. One with no type (its copy and its source both gone) stands for
    // no entity, and lists no change
    const snapshotsByType = new Map<string, typeof snapshots>();
    for (const snap of snapshots) {
      if (!snap.entityType) continue;
      if (!snapshotsByType.has(snap.entityType)) snapshotsByType.set(snap.entityType, []);
      snapshotsByType.get(snap.entityType)!.push(snap);
    }

    type ChangeRow =
      | { entityId: string; entityType: RulesetEntityType; name: string; sourceEntityId: string; status: "modified" }
      | { entityType: RulesetEntityType; name: string; sourceEntityId: string; status: "deleted" }
      | { entityId: string; entityType: RulesetEntityType; name: string; status: "added" };

    const changes: ChangeRow[] = [];
    const restorable = Engine.rules().restorableKinds();

    // Walk every entity type so we can emit "added" rows for locally-owned
    // entities that aren't tracked by any snapshot, alongside the snapshot-
    // tracked "modified"/"deleted" rows.
    for (const entityType of RULESET_ENTITY_TYPES) {
      const typeSnapshots = snapshotsByType.get(entityType) ?? [];
      const forkedIds = typeSnapshots.map((s) => s.forkedEntityId);

      // Locally-owned rows. Forked entity ids that have a snapshot are COWs
      // (modified/deleted); the rest are locally-created (added).
      const localRows = await RulesetEntities.findNames(db, entityType, { rulesetId });
      const forkedIdSet = new Set(forkedIds);
      const localById = new Map(localRows.map((r) => [r.id, r]));

      for (const local of localRows) {
        if (forkedIdSet.has(local.id)) continue;
        changes.push({
          entityType,
          status: "added",
          entityId: local.id,
          name: local.name,
        });
      }

      // A read-only kind (3.5's abilities) has no snapshots: no route edits it.
      if (typeSnapshots.length === 0 || !restorable.includes(entityType)) continue;

      // Tombstones (COW hard-deleted) need the source entity's name as a fallback.
      const sourceIds = typeSnapshots.map((s) => s.sourceEntityId);
      const sourceRows = await RulesetEntities.findNames(db, entityType, { ids: sourceIds });
      const sourceById = new Map(sourceRows.map((r) => [r.id, r]));

      for (const snap of typeSnapshots) {
        const forked = localById.get(snap.forkedEntityId);
        if (forked) {
          changes.push({
            entityType,
            status: "modified",
            sourceEntityId: snap.sourceEntityId,
            entityId: snap.forkedEntityId,
            name: forked.name,
          });
          continue;
        }
        const source = sourceById.get(snap.sourceEntityId);
        if (!source) continue;
        changes.push({
          entityType,
          status: "deleted",
          sourceEntityId: snap.sourceEntityId,
          name: source.name,
        });
      }
    }

    // One order, whatever the rows' storage: by kind, as walked, then by name
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
