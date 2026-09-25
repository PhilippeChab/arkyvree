import type { Db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { EntitySnapshots } from "@/server/repositories/index.ts";
import type { EntityType } from "@/server/services/rulesets/hashing.ts";
import { ENTITY_REPOS } from "./constants.ts";

/**
 * Pre-create check for entity name uniqueness across the source chain. Throws
 * a ConflictError if the name is already taken in the fork or in an ancestor
 * (without a snapshot allowing the override). Returns the conflicting ancestor
 * entity ID when an inherited entity with the same name is hidden by a
 * tombstone snapshot — the caller should pass this to `repointTombstoneSnapshot`
 * after `Repo.create` so the snapshot follows the new entity.
 */
export async function assertEntityNameAvailable(
  tx: Db,
  rulesetId: string,
  sourceChain: string[],
  entityType: EntityType,
  name: string,
): Promise<{ tombstoneAncestorId: string | null }> {
  const repo = ENTITY_REPOS[entityType];
  const own = await repo.findOne(tx, { name, rulesetId } as never);
  if (own) throw new ConflictError("Name already exists in this ruleset");

  for (const ancestorId of sourceChain) {
    const conflict = await repo.findOne(tx, { name, rulesetId: ancestorId } as never);
    if (!conflict) continue;
    const snapshot = await EntitySnapshots.findBySourceAndRuleset(tx, {
      sourceEntityId: conflict.id,
      rulesetId,
    });
    if (!snapshot) throw new ConflictError("Name already exists in the source chain (an ancestor or subscribed extension)");
    return { tombstoneAncestorId: conflict.id };
  }
  return { tombstoneAncestorId: null };
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
