import type { CowData, RulesetSources } from "@/engine/index.ts";
import type { Db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { EntitySnapshots, type RulesetEntityType } from "@/server/repositories/index.ts";

import EntityRepositories from "./EntityRepositories.ts";

/**
 * The names a new entity may take in a ruleset's composed view (`new EntityNames(ruleset, rulesetData.cow)`): not one
 * the ruleset has, nor one an inherited entity it shows has. An inherited entity the view hides doesn't block its name,
 * and one whose local copy was deleted left a tombstone snapshot, which the new entity takes over (`repointTombstone`),
 * so the inherited one stays hidden. Every method takes the transaction.
 */
export default class EntityNames {
  constructor(
    private readonly ruleset: RulesetSources,
    private readonly cow: CowData,
  ) {}

  /**
   * Refuses a name a visible inherited entity has (`ancestorIds`, the source chain's entities of that name), and
   * returns the hidden ones whose local copy was deleted: a tombstone snapshot, for a new entity to take over. A live
   * local copy keeps its snapshot even after a rename, so inherited references keep resolving to it. Shared by the
   * single and the batched checks (an item's variants).
   */
  async assertAncestorNamesHidden(tx: Db, entityType: RulesetEntityType, ancestorIds: string[]): Promise<Set<string>> {
    if (ancestorIds.some((id) => !this.cow.isHidden(id)))
      throw new ConflictError("Name already exists in the source chain (an ancestor or subscribed extension)");

    const repo = EntityRepositories.of(entityType);
    const snapshots = await EntitySnapshots.findMany(tx, { sourceEntityIds: ancestorIds, rulesetId: this.ruleset.id });
    const tombstoned = new Set<string>();
    for (const snapshot of snapshots) {
      // The local copy, as stored: deleted, it leaves the snapshot a tombstone
      if (!(await repo.exists(tx, { id: snapshot.forkedEntityId }))) tombstoned.add(snapshot.sourceEntityId);
    }
    return tombstoned;
  }

  /**
   * Refuses a new entity's name when the ruleset has it, or a visible inherited entity does. Returns the closest hidden
   * ancestor whose local copy was deleted (a tombstone), which the caller passes to `repointTombstone` once the entity
   * is created, so the snapshot follows the new entity.
   */
  async assertNameAvailable(
    tx: Db,
    entityType: RulesetEntityType,
    name: string,
  ): Promise<{ tombstoneAncestorId: string | null }> {
    const repo = EntityRepositories.of(entityType);
    const own = await repo.findOne(tx, { name, rulesetId: this.ruleset.id });
    if (own) throw new ConflictError("Name already exists in this ruleset");

    const ancestorIds: string[] = [];
    for (const ancestorId of this.cow.sourceChain) {
      const conflict = await repo.findOne(tx, { name, rulesetId: ancestorId });
      if (conflict) ancestorIds.push(conflict.id);
    }
    const tombstoned = await this.assertAncestorNamesHidden(tx, entityType, ancestorIds);
    return { tombstoneAncestorId: ancestorIds.find((id) => tombstoned.has(id)) ?? null };
  }

  /**
   * Points the tombstone snapshot a deleted local copy of `ancestorEntityId` left at the new entity of its name, so the
   * inherited entity stays hidden behind it.
   */
  async repointTombstone(
    tx: Db,
    entityType: RulesetEntityType,
    ancestorEntityId: string,
    newEntityId: string,
  ): Promise<void> {
    const tombstone = await EntitySnapshots.findOne(tx, {
      sourceEntityId: ancestorEntityId,
      rulesetId: this.ruleset.id,
    });
    if (!tombstone) return;
    await EntitySnapshots.delete(tx, {
      sourceEntityId: ancestorEntityId,
      rulesetId: this.ruleset.id,
    });
    await EntitySnapshots.create(tx, {
      rulesetId: this.ruleset.id,
      entityType,
      sourceEntityId: ancestorEntityId,
      forkedEntityId: newEntityId,
    });
  }
}
