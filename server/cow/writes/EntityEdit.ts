import type { Db } from "@/drizzle/database.ts";
import type { CowData, OwnedKind, RulesetSources } from "@/engine/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Entities, OWNED_TYPES, type RulesetEntityType } from "@/server/repositories/index.ts";

import EntityCopy from "./EntityCopy.ts";

/**
 * The row a write to a ruleset's entity changes, and whether it's a copy this call made: a copy takes no stale-edit
 * check (the client's `updatedAt` is its source's), and what its owned entities' and customizations' ids became
 * (`copiedIds`, by their source's).
 */
export interface EditTarget {
  copied: boolean;
  copiedIds: ReadonlyMap<string, string>;
  id: string;
}

/** What a write that copied nothing targets: the ruleset's own row. */
function own(id: string): EditTarget {
  return { id, copied: false, copiedIds: new Map() };
}

/**
 * The row a write to a ruleset's entity changes, in its scope (`new EntityEdit(ruleset, rulesetData.cow)`): the
 * ruleset's own entity, locked when the write needs it, or the copy of an inherited one, made on its first edit
 * (`EntityCopy`). An entity another owns (a class level) is written on its owner's: the owner copied with what it owns,
 * and the owned entity mapped to its copy by its position. Its copy-on-write data gives it the entity the view shows
 * for an id and the source chain. Every method takes the transaction.
 */
export default class EntityEdit {
  constructor(
    private readonly ruleset: RulesetSources,
    private readonly cow: CowData,
  ) {}

  /** Locks an entity a change writes under (its customizations, its delete), by its stored id: a not found when gone. */
  static async lock(tx: Db, entityId: string): Promise<void> {
    if (!(await Entities.lock(tx, { id: entityId })))
      throw new NotFoundError("Customization source no longer exists; refresh the entity");
  }

  /**
   * The row a write to the entity the view shows for an id changes (`entityId`, of `entityType`), resolved through the
   * view: the ruleset's own, locked, or the copy of an inherited one; an owned entity's on its owner's (`cowOwned`).
   * Refused as not found when the view shows none, or shows one from outside the source chain.
   */
  async cowById(tx: Db, entityType: string, entityId: string): Promise<EditTarget> {
    const ownerType = OWNED_TYPES.get(entityType as OwnedKind);
    if (ownerType) return await this.cowOwned(tx, entityType, ownerType, entityId);

    const type = entityType as RulesetEntityType;
    // The entity the view shows for the id: the ruleset's copy of it, or the winner of its siblings
    const entity = await Entities.findOne(tx, { entityType: type, id: this.cow.resolve(entityId) });
    if (!entity) throw new NotFoundError("Customization source not found in this ruleset");

    if (entity.rulesetId === this.ruleset.id) {
      await EntityEdit.lock(tx, entity.id);
      return own(entity.id);
    }
    if (!this.cow.sourceChain.includes(entity.rulesetId))
      throw new NotFoundError("Customization source not found in this ruleset"); // Not from source chain

    const copy = await EntityCopy.create(tx, type, entity.id, this.ruleset);
    return { id: copy.entity.id, copied: true, copiedIds: copy.copiedIds };
  }

  /**
   * The row an owned entity's write changes (`ownedId`, of `entityType`, owned by `ownerType`: a class level, by its
   * class): its own, its owner locked so the write waits on other writes of it, or, its owner inherited, its copy's of
   * its position, the owner copied with what it owns. Refused as not found when the view shows none, or when the owned
   * entity was deleted while the write waited on its owner.
   */
  async cowOwned(tx: Db, entityType: string, ownerType: RulesetEntityType, ownedId: string): Promise<EditTarget> {
    // The owned entity the view shows for the id, and its owner
    const [owned] = await Entities.findPositions(tx, { entityType, ids: [this.cow.resolve(ownedId)] });
    if (!owned) throw new NotFoundError("Customization source not found in this ruleset");

    const owner = await Entities.findOne(tx, { entityType: ownerType, id: this.cow.resolve(owned.ownerId) });
    if (!owner) throw new NotFoundError("Customization source not found in this ruleset");
    const ownerRulesetId = String(owner.rulesetId);

    if (ownerRulesetId === this.ruleset.id) {
      await EntityEdit.lock(tx, owner.id);
      if (!(await Entities.findOne(tx, { entityType, id: owned.id })))
        throw new NotFoundError("Customization source no longer exists; refresh the entity");

      return own(owned.id);
    }
    if (!this.cow.sourceChain.includes(ownerRulesetId))
      throw new NotFoundError("Customization source not found in this ruleset"); // Not from source chain

    // Copy the owner (it copies what it owns), and find the owned entity's copy by its position: owned entities aren't
    // snapshotted one by one
    const copy = await EntityCopy.create(tx, ownerType, owner.id, this.ruleset);
    const copies = await Entities.findPositions(tx, { entityType, ownerIds: [copy.entity.id] });
    const ownedCopy = copies.find((candidate) => candidate.position === owned.position);
    if (!ownedCopy) throw new NotFoundError("Copied owned entity not found");
    return { id: ownedCopy.id, copied: true, copiedIds: copy.copiedIds };
  }

  /**
   * The row a delete of `entity` removes: as `cowToEdit`, and the ruleset's own entity is locked first, so its
   * customizations' writes wait for the delete.
   */
  async cowToDelete(tx: Db, entityType: RulesetEntityType, entity: { id: string; rulesetId: string }): Promise<string> {
    const target = await this.cowToEdit(tx, entityType, entity);
    if (!target.copied) await EntityEdit.lock(tx, target.id);
    return target.id;
  }

  /**
   * The row an edit of `entity` (as the engine found it in the view) writes: the ruleset's own entity, or the copy of an
   * inherited one, made on its first edit, with the customizations it copied, by their source's id (`copiedIds`).
   */
  async cowToEdit(
    tx: Db,
    entityType: RulesetEntityType,
    entity: { id: string; rulesetId: string },
  ): Promise<EditTarget> {
    if (entity.rulesetId === this.ruleset.id) return own(entity.id);
    const copy = await EntityCopy.create(tx, entityType, entity.id, this.ruleset);
    return { id: copy.entity.id, copied: true, copiedIds: copy.copiedIds };
  }
}
