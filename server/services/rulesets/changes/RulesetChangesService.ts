import { invalidateRuleset } from "@/server/cache/rulesetCache/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { EntitySnapshots, Items, RulesetEntities, Rulesets } from "@/server/repositories/index.ts";
import { RULESET_ENTITY_TYPES } from "@/server/repositories/rulesets/entityTables.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { entityHasCharacterPicks } from "@/server/services/rulesets/cow/index.ts";
import type { EntityType } from "@/server/services/rulesets/cow/index.ts";
import { deleteEntityWithCascade } from "@/server/services/rulesets/deleteEntityWithCascade.ts";
import type { Session } from "@/shared/relations.ts";

class RulesetChangesService {
  async getChanges(session: Session, rulesetId: string) {
    const ruleset = await Rulesets.findOne(db, { id: rulesetId });
    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }

    (await RulesetsPolicy.for(db, session, ruleset)).canViewChanges();

    if (!ruleset.rulesetId) {
      throw new BadRequestError("Only forked rulesets have local changes");
    }

    const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId });

    // Group snapshots by entity type for batch fetching
    const snapshotsByType = new Map<string, typeof snapshots>();
    for (const snap of snapshots) {
      if (!snapshotsByType.has(snap.entityType)) snapshotsByType.set(snap.entityType, []);
      snapshotsByType.get(snap.entityType)!.push(snap);
    }

    type ChangeRow =
      | { entityType: string; status: "modified"; sourceEntityId: string; entityId: string; name: string }
      | { entityType: string; status: "deleted"; sourceEntityId: string; name: string }
      | { entityType: string; status: "added"; entityId: string; name: string };

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

      if (typeSnapshots.length === 0) continue;

      // Tombstones (COW hard-deleted) need the source entity's name as a fallback.
      const sourceIds = typeSnapshots.map((s) => s.sourceEntityId);
      const sourceRows = await RulesetEntities.findNames(db, entityType, { ids: sourceIds });
      const sourceById = new Map(sourceRows.map((r) => [r.id, r]));

      for (const snap of typeSnapshots) {
        const forked = localById.get(snap.forkedEntityId);
        if (forked) {
          changes.push({
            entityType: snap.entityType,
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
          entityType: snap.entityType,
          status: "deleted",
          sourceEntityId: snap.sourceEntityId,
          name: source.name,
        });
      }
    }

    return changes;
  }

  async revertOverride(session: Session, rulesetId: string, entityType: EntityType, entityId: string) {
    const result = await withTransaction(async (tx) => {
      const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

      const snapshot = await EntitySnapshots.findBySourceAndRuleset(tx, {
        sourceEntityId: entityId,
        rulesetId,
      });

      if (!snapshot) {
        throw new NotFoundError("Entity is not an override in this ruleset");
      }

      // Reverting hard-deletes the COW row, and FK CASCADE then wipes any
      // character picks pointing at it. Mirror the inUse guard each delete
      // service runs (current ruleset + descendants).
      if (await entityHasCharacterPicks(tx, entityType, snapshot.forkedEntityId, rulesetId)) {
        throw new ConflictError("Cannot revert override while characters in this ruleset depend on it");
      }

      // For items, repoint copies from the COW back to the original parent template
      // before the cascade hard-deletes (RESTRICT FK). Klass_levels and dependent
      // character_levels are wiped via FK CASCADE on the parent klass row.
      if (entityType === "items") {
        await Items.updateCopies(tx, { sourceItemId: entityId }, { sourceItemId: snapshot.forkedEntityId });
      }
      await deleteEntityWithCascade(tx, entityType, snapshot.forkedEntityId);
      await EntitySnapshots.deleteBySourceAndRuleset(tx, {
        sourceEntityId: entityId,
        rulesetId,
      });

      return { restored: true };
    });

    invalidateRuleset(rulesetId);
    return result;
  }
}

export default new RulesetChangesService();
