import type { CowData, RulesetSources } from "@/engine/index.ts";
import { type Db, withCowContext } from "@/server/database/index.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import {
  EntitySnapshots,
  Klasses,
  KlassLevels,
  Modifiers,
  Properties,
  Requirements,
  type RulesetEntityType,
} from "@/server/repositories/index.ts";

import EntityCopy, { type CopiedEntity } from "./EntityCopy.ts";
import { ENTITY_REPOS, lockEntityForMutation } from "./entityRepositories.ts";

type CustomizationKind = keyof typeof CUSTOMIZATION_REPOS;

/**
 * The row a customization of an entity changes (`cowOwner`), and what its copy copied when this call copied it: a
 * nested customization (a modifier's requirement) resolves through the same copy.
 */
interface Owner {
  copiedIds?: ReadonlyMap<string, string>;
  id: string;
}

/** Each customization kind's repository: what a change to a copied entity's customization resolves the row through. */
const CUSTOMIZATION_REPOS = {
  property: Properties,
  requirement: Requirements,
  modifier: Modifiers,
} as const;

/** The entity types a customization's owner can be, which a customization change copies when inherited. */
const OWNER_TYPES: Record<string, RulesetEntityType> = {
  feats: "feats",
  powers: "powers",
  items: "items",
  races: "races",
  klasses: "klasses",
};

/**
 * One change to a ruleset's entities, made in its scope (`new RulesetEdit(ruleset, rulesetData.cow)`): the rows it
 * writes, the ruleset's own or the copy of an inherited one, made on its first edit (`EntityCopy`), and the names a new
 * entity may take in the ruleset's composed view. Its copy-on-write data gives it the source chain and what the view
 * hides; a copy builds its own, through the transaction (`readCowData(tx, ruleset)`). Every method that queries
 * takes the transaction; a copy and the ids it copied live for the call that made it.
 */
export default class RulesetEdit {
  constructor(ruleset: RulesetSources, cow: CowData) {
    this.ruleset = ruleset;
    this.cow = cow;
  }

  private readonly cow: CowData;

  private readonly ruleset: RulesetSources;

  /** Copies an inherited entity into the ruleset (or returns the copy it has), on the ruleset's source chain. */
  private async copyEntity(tx: Db, entityType: RulesetEntityType, entityId: string): Promise<CopiedEntity> {
    return EntityCopy.create(tx, entityType, entityId, this.ruleset);
  }

  /**
   * The row a customization of a feat, power, item, race, class or class level changes: the ruleset's own entity,
   * locked, or the copy of an inherited one (a class level's class is copied with its levels, and the level mapped to
   * its copy).
   */
  private async cowEntityOwner(tx: Db, entityType: string, entityId: string): Promise<Owner> {
    if (entityType === "klass_levels") return this.cowKlassLevelOwner(tx, entityId);

    const cowType = OWNER_TYPES[entityType];
    if (!cowType) throw new NotFoundError("Customization source not found in this ruleset");

    const repo = ENTITY_REPOS[cowType];
    const entity = await repo.findOne(tx, { id: entityId });
    if (!entity) throw new NotFoundError("Customization source not found in this ruleset");

    if (entity.rulesetId === this.ruleset.id) {
      await lockEntityForMutation(tx, cowType, entity.id);
      return { id: entity.id };
    }
    if (!this.cow.sourceChain.includes(entity.rulesetId))
      throw new NotFoundError("Customization source not found in this ruleset"); // Not from source chain

    const copy = await this.copyEntity(tx, cowType, entity.id);
    return { id: copy.entity.id, copiedIds: copy.copiedIds };
  }

  /** A class level as the owner of customizations: its class's own, locked, or the class copied and the level mapped. */
  private async cowKlassLevelOwner(tx: Db, levelId: string): Promise<Owner> {
    // Find which klass owns this level
    const level = await KlassLevels.findOne(tx, { id: levelId });
    if (!level) throw new NotFoundError("Customization source not found in this ruleset");

    const klass = await Klasses.findOne(tx, { id: level.klassId });
    if (!klass) throw new NotFoundError("Customization source not found in this ruleset");

    if (klass.rulesetId === this.ruleset.id) {
      await lockEntityForMutation(tx, "klasses", klass.id);
      if (!(await KlassLevels.findOne(tx, { id: level.id })))
        throw new NotFoundError("Customization source no longer exists; refresh the entity");

      return { id: level.id };
    }
    if (!this.cow.sourceChain.includes(klass.rulesetId))
      throw new NotFoundError("Customization source not found in this ruleset"); // Not from source chain

    // COW the klass (copies all levels)
    const copy = await this.copyEntity(tx, "klasses", klass.id);
    // Find the new level by matching level number (levels aren't individually snapshotted)
    const newLevels = await KlassLevels.findMany(tx, { klassId: copy.entity.id });
    const newLevel = newLevels.find((l) => l.level === level.level);
    if (!newLevel) throw new NotFoundError("Copied class level not found");
    return { id: newLevel.id, copiedIds: copy.copiedIds };
  }

  /** Resolve a modifier as the owner of requirements: COW its owning entity and map the modifier to its copy. */
  private async cowModifierOwner(tx: Db, modifierId: string): Promise<Owner> {
    // Keep the stored source ID: the repository proxy remaps it after COW,
    // which would make an ancestor modifier appear locally owned on repeat edits.
    const modifier = await withCowContext(undefined, () => Modifiers.findOne(tx, { id: modifierId }));
    if (!modifier || modifier.sourceType === "modifiers")
      throw new NotFoundError("Customization source not found in this ruleset");

    const owner = await this.cowEntityOwner(tx, modifier.sourceType, modifier.sourceId);
    const id = await this.resolveExistingCustomization(tx, modifier.sourceId, owner, "modifier", modifier.id);
    return { id, copiedIds: owner.copiedIds };
  }

  private async cowOwnerOf(tx: Db, entityType: string, entityId: string): Promise<Owner> {
    if (entityType === "modifiers") return this.cowModifierOwner(tx, entityId);
    return this.cowEntityOwner(tx, entityType, entityId);
  }

  /**
   * The customization `customizationId` of `entityId` once that entity resolved to `owner`: its copy when this call
   * copied the entity (by the ids recorded at copy time: equal customization values aren't unique), or itself, which
   * must still exist.
   */
  private async resolveExistingCustomization(
    tx: Db,
    entityId: string,
    owner: Owner,
    kind: CustomizationKind,
    customizationId: string,
  ): Promise<string> {
    let resolvedCustomizationId = customizationId;
    if (owner.id !== entityId) {
      const copiedId = owner.copiedIds?.get(customizationId);
      if (!copiedId) throw new NotFoundError(`Copied ${kind} not found`);
      resolvedCustomizationId = copiedId;
    }
    if (
      resolvedCustomizationId === customizationId &&
      !(await withCowContext(undefined, () => CUSTOMIZATION_REPOS[kind].exists(tx, { id: customizationId })))
    )
      throw new NotFoundError("Customization source no longer exists; refresh the entity");

    return resolvedCustomizationId;
  }

  /**
   * Shared by the single and batched pre-create name checks. Throws a
   * ConflictError if any same-name ancestor is visible in the composed view.
   * Returns the hidden ones whose local copy was deleted, leaving a tombstone
   * snapshot for a new entity to take over. A live local copy keeps its snapshot
   * even after a rename, so inherited references keep resolving to it.
   */
  async assertAncestorNamesHidden(tx: Db, entityType: RulesetEntityType, ancestorIds: string[]): Promise<Set<string>> {
    if (ancestorIds.some((id) => !this.cow.isHidden(id)))
      throw new ConflictError("Name already exists in the source chain (an ancestor or subscribed extension)");

    const repo = ENTITY_REPOS[entityType];
    const snapshots = await EntitySnapshots.findMany(tx, { sourceEntityIds: ancestorIds, rulesetId: this.ruleset.id });
    const tombstoned = new Set<string>();
    for (const snapshot of snapshots) {
      // Stored id of the local copy — check it as written, without COW remapping.
      if (!(await withCowContext(undefined, () => repo.exists(tx, { id: snapshot.forkedEntityId }))))
        tombstoned.add(snapshot.sourceEntityId);
    }
    return tombstoned;
  }

  /**
   * Pre-create check for entity name uniqueness in the ruleset's composed view.
   * Throws a ConflictError if the name is taken in the fork or by a visible
   * inherited entity. Inherited entities hidden by an override (for example a
   * local copy renamed since) don't block the name. Returns the closest hidden
   * ancestor whose local copy was deleted (a tombstone) — the caller should pass
   * this to `repointTombstone` after `Repo.create` so the snapshot
   * follows the new entity.
   */
  async assertNameAvailable(
    tx: Db,
    entityType: RulesetEntityType,
    name: string,
  ): Promise<{ tombstoneAncestorId: string | null }> {
    const repo = ENTITY_REPOS[entityType];
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
   * Resolve the stored row a customization update or delete should change.
   * `entityId` is the owner the row is shown on, so visible sibling contributions
   * resolve like the entity's own rows. COWs that owner when inherited and returns
   * the copy made for the row. A row on a local owner is re-read after the owner
   * lock, which may have waited for its deletion.
   */
  async cowCustomization(
    tx: Db,
    entityType: string,
    entityId: string,
    kind: CustomizationKind,
    customizationId: string,
  ): Promise<{ resolvedCustomizationId: string; resolvedEntityId: string }> {
    const owner = await this.cowOwnerOf(tx, entityType, entityId);
    const resolvedCustomizationId = await this.resolveExistingCustomization(tx, entityId, owner, kind, customizationId);
    return { resolvedEntityId: owner.id, resolvedCustomizationId };
  }

  /**
   * COW helper for customization mutations. Given an entityType and entityId,
   * checks if the entity belongs to the parent ruleset and COWs it if needed.
   * Returns the resolved entityId (original if owned, COW'd copy if inherited).
   *
   * For klass_levels: COWs the entire parent klass, then maps the old level ID
   * to the new one by its level number.
   */
  async cowOwner(tx: Db, entityType: string, entityId: string): Promise<string> {
    return (await this.cowOwnerOf(tx, entityType, entityId)).id;
  }

  /**
   * The row a delete of `entity` removes: as `cowToEdit`, and the ruleset's own entity is locked first, so its
   * customizations' writes wait for the delete.
   */
  async cowToDelete(tx: Db, entityType: RulesetEntityType, entity: { id: string; rulesetId: string }): Promise<string> {
    const target = await this.cowToEdit(tx, entityType, entity);
    if (!target.copied) await lockEntityForMutation(tx, entityType, target.id);
    return target.id;
  }

  /**
   * The row an edit of `entity` (as the engine found it in the view) writes: the ruleset's own entity, or the copy of an inherited
   * one, made on its first edit. A copy takes no stale-edit check: the client's `updatedAt` is the source's.
   */
  async cowToEdit(
    tx: Db,
    entityType: RulesetEntityType,
    entity: { id: string; rulesetId: string },
  ): Promise<{ copied: boolean; id: string }> {
    if (entity.rulesetId === this.ruleset.id) return { id: entity.id, copied: false };
    const copy = await this.copyEntity(tx, entityType, entity.id);
    return { id: copy.entity.id, copied: true };
  }

  /**
   * After creating a new locally-owned entity, check for a tombstone snapshot
   * left behind by a previous override-delete on the conflicting ancestor entity.
   * If found, repoint the snapshot's `forkedEntityId` to the new entity so the
   * inherited version stays hidden from the source-chain.
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
