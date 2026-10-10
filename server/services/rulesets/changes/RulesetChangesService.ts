import { EntityRevert, RulesetViews } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import {
  EntitySnapshots,
  RULESET_ENTITY_TYPES,
  RulesetEntities,
  type RulesetEntityType,
  Rulesets,
} from "@/server/repositories/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import type { Session } from "@/shared/relations.ts";

import { RESTORABLE_ENTITY_TYPES, type RestorableEntityType } from "./restorableEntityTypes.ts";

class RulesetChangesService {
  async getChanges(session: Session, rulesetId: string) {
    const ruleset = await Rulesets.findOne(db, { id: rulesetId });
    if (!ruleset) throw new NotFoundError("Ruleset not found");

    (await RulesetsPolicy.for(db, session, ruleset)).canViewChanges();

    if (!ruleset.rulesetId) throw new BadRequestError("Only forked rulesets have local changes");

    const snapshots = await EntitySnapshots.findMany(db, { rulesetId });

    // Group snapshots by entity type for batch fetching
    const snapshotsByType = new Map<string, typeof snapshots>();
    for (const snap of snapshots) {
      if (!snapshotsByType.has(snap.entityType)) snapshotsByType.set(snap.entityType, []);
      snapshotsByType.get(snap.entityType)!.push(snap);
    }

    type ChangeRow =
      | { entityId: string; entityType: RestorableEntityType; name: string; sourceEntityId: string; status: "modified" }
      | { entityType: RestorableEntityType; name: string; sourceEntityId: string; status: "deleted" }
      | { entityId: string; entityType: RulesetEntityType; name: string; status: "added" };

    const changes: ChangeRow[] = [];

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

      // Abilities have no snapshots: no route edits them.
      if (typeSnapshots.length === 0 || !isOneOf(entityType, RESTORABLE_ENTITY_TYPES)) continue;

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

    return changes;
  }

  /**
   * Reverts the fork's copy of an inherited entity to its parent's (`EntityRevert`): what names the copy, the fork's
   * rows, its subscribers' and their characters', names the parent's entity again.
   */
  async revertOverride(session: Session, rulesetId: string, entityType: RestorableEntityType, entityId: string) {
    const subscribers = await withTransaction(async (tx) => {
      const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
      if (!ruleset) throw new NotFoundError("Ruleset not found");

      (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

      await EntityRevert.revert(tx, entityType, entityId, rulesetId);
      // The rulesets built on it, whose rows may have named the copy: its subscribers, when it's an extension
      return await Rulesets.findMany(tx, { extensionRulesetId: rulesetId });
    });

    for (const id of [rulesetId, ...subscribers.map((subscriber) => subscriber.id)]) RulesetViews.invalidate(id);
    return { restored: true };
  }
}

export default new RulesetChangesService();
