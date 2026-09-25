import type { Db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { EntitySnapshots } from "@/server/repositories/index.ts";
import { withCowContext } from "@/server/services/rulesets/cowContext.ts";
import type { EntityType } from "@/server/services/rulesets/hashing.ts";
import { ENTITY_REPOS } from "./constants.ts";
import type { CowData } from "./cowData.ts";

/**
 * Pre-create check for entity name uniqueness in the ruleset's composed view.
 * Throws a ConflictError if the name is taken in the fork or by a visible
 * inherited entity. Inherited entities hidden by an override (for example a
 * local copy renamed since) don't block the name. Returns the closest hidden
 * ancestor whose local copy was deleted (a tombstone) — the caller should pass
 * this to `repointTombstoneSnapshot` after `Repo.create` so the snapshot
 * follows the new entity.
 */
export async function assertEntityNameAvailable(
  tx: Db,
  rulesetId: string,
  cow: CowData,
  entityType: EntityType,
  name: string,
): Promise<{ tombstoneAncestorId: string | null }> {
  const repo = ENTITY_REPOS[entityType];
  const own = await repo.findOne(tx, { name, rulesetId } as never);
  if (own) throw new ConflictError("Name already exists in this ruleset");

  const ancestorIds: string[] = [];
  for (const ancestorId of cow.sourceChain) {
    const conflict = await repo.findOne(tx, { name, rulesetId: ancestorId } as never);
    if (conflict) ancestorIds.push(conflict.id);
  }
  const tombstoned = await assertAncestorNamesHidden(tx, rulesetId, cow, entityType, ancestorIds);
  return { tombstoneAncestorId: ancestorIds.find((id) => tombstoned.has(id)) ?? null };
}

/**
 * Shared by the single and batched pre-create name checks. Throws a
 * ConflictError if any same-name ancestor is visible in the composed view.
 * Returns the hidden ones whose local copy was deleted, leaving a tombstone
 * snapshot for a new entity to take over. A live local copy keeps its snapshot
 * even after a rename, so inherited references keep resolving to it.
 */
export async function assertAncestorNamesHidden(
  tx: Db,
  rulesetId: string,
  cow: CowData,
  entityType: EntityType,
  ancestorIds: string[],
): Promise<Set<string>> {
  if (ancestorIds.some((id) => !cow.overrideMap.has(id) && !cow.siblingIds.has(id))) {
    throw new ConflictError("Name already exists in the source chain (an ancestor or subscribed extension)");
  }
  const repo = ENTITY_REPOS[entityType];
  const snapshots = await EntitySnapshots.findManyBySourcesAndRuleset(tx, { sourceEntityIds: ancestorIds, rulesetId });
  const tombstoned = new Set<string>();
  for (const snapshot of snapshots) {
    // Stored id of the local copy — check it as written, without COW remapping.
    if (!await withCowContext(undefined, () => repo.exists(tx, { id: snapshot.forkedEntityId }))) {
      tombstoned.add(snapshot.sourceEntityId);
    }
  }
  return tombstoned;
}

/**
 * After creating a new locally-owned entity, check for a tombstone snapshot
 * left behind by a previous override-delete on the conflicting ancestor entity.
 * If found, repoint the snapshot's `forkedEntityId` to the new entity so the
 * inherited version stays hidden from the source-chain.
 */
export async function repointTombstoneSnapshot(
  tx: Db,
  rulesetId: string,
  entityType: EntityType,
  ancestorEntityId: string,
  newEntityId: string,
): Promise<void> {
  const tombstone = await EntitySnapshots.findBySourceAndRuleset(tx, {
    sourceEntityId: ancestorEntityId,
    rulesetId,
  });
  if (!tombstone) return;
  await EntitySnapshots.deleteBySourceAndRuleset(tx, {
    sourceEntityId: ancestorEntityId,
    rulesetId,
  });
  await EntitySnapshots.create(tx, {
    rulesetId,
    entityType,
    sourceEntityId: ancestorEntityId,
    forkedEntityId: newEntityId,
    contentHash: tombstone.contentHash,
  });
}
