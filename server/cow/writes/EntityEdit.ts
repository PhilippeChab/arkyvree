import type { Db } from "@/drizzle/database.ts";
import { type CowData, Engine } from "@/engine/index.ts";
import type { LockedRulesetScope } from "@/server/cow/views/scope.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Entities, type RulesetEntityType } from "@/server/repositories/index.ts";

import EditTarget from "./EditTarget.ts";
import EntityCopy from "./EntityCopy.ts";

/**
 * The row a write to a ruleset's entity changes, in the scope a write holds (`new EntityEdit(scope)`, under its lock:
 * its view fresh, and no other write of the ruleset, nor of its source chain, running meanwhile): the ruleset's own
 * entity, or the copy of an inherited one, made on its first edit (`EntityCopy`). An entity another owns (a class
 * level) is written on its owner's: the owner copied with what it owns, and the owned entity mapped to its copy by its
 * position. Its copy-on-write data gives it the entity the view shows for an id and the source chain. Every method takes
 * the transaction, and refuses an entity the view doesn't show as not found, in the write's words (`notFound`).
 */
export default class EntityEdit {
  constructor(private readonly scope: LockedRulesetScope) {}

  /** The ruleset's copy-on-write data, as its view was read under the write's lock. */
  private get cow(): CowData {
    return this.scope.rulesetData.cow;
  }

  /** The copy of an inherited entity (`entityId`, of `entityType`), made on its first edit, as the target of a write that named it `namedId`: with what it copied. */
  private async copy(tx: Db, entityType: RulesetEntityType, entityId: string, namedId: string): Promise<EditTarget> {
    const copy = await EntityCopy.create(tx, entityType, entityId, this.scope);
    return new EditTarget(copy.entity.id, namedId, copy.copiedIds);
  }

  /**
   * The row a write to the entity the view shows for an id changes (`entityId`, of `entityType`), resolved through the
   * view: the ruleset's own, or the copy of an inherited one; an owned entity's on its owner's (`cowOwned`). Refused as
   * not found (`notFound`: a customization's source's, an entity's) when the view shows none, or shows one from outside
   * the source chain.
   */
  async cowById(tx: Db, entityType: string, entityId: string, notFound: string): Promise<EditTarget> {
    const ownerType = Engine.storage().ownerOf(entityType);
    if (ownerType) return await this.cowOwned(tx, entityType, ownerType as RulesetEntityType, entityId, notFound);

    const type = entityType as RulesetEntityType;
    // The entity the view shows for the id: the ruleset's copy of it, or the winner of its siblings
    const entity = await Entities.findOne(tx, { entityType: type, id: this.cow.resolve(entityId) });
    if (!entity) throw new NotFoundError(notFound);

    if (entity.rulesetId === this.scope.sources.id) return new EditTarget(entity.id, entityId);
    // Not from the source chain
    if (!this.cow.sourceChain.includes(entity.rulesetId)) throw new NotFoundError(notFound);

    return await this.copy(tx, type, entity.id, entityId);
  }

  /**
   * The row an owned entity's write changes (`ownedId`, of `entityType`, owned by `ownerType`: a class level, by its
   * class): its own, or, its owner inherited, its copy's of its position, the owner copied with what it owns. Refused
   * as not found (`notFound`) when the view shows none.
   */
  async cowOwned(
    tx: Db,
    entityType: string,
    ownerType: RulesetEntityType,
    ownedId: string,
    notFound: string,
  ): Promise<EditTarget> {
    // The owned entity the view shows for the id, and its owner
    const [owned] = await Entities.findPositions(tx, { entityType, ids: [this.cow.resolve(ownedId)] });
    if (!owned) throw new NotFoundError(notFound);

    const owner = await Entities.findOne(tx, { entityType: ownerType, id: this.cow.resolve(owned.ownerId) });
    if (!owner) throw new NotFoundError(notFound);
    const ownerRulesetId = String(owner.rulesetId);

    if (ownerRulesetId === this.scope.sources.id) return new EditTarget(owned.id, ownedId);
    // Not from the source chain
    if (!this.cow.sourceChain.includes(ownerRulesetId)) throw new NotFoundError(notFound);

    // Copy the owner (it copies what it owns), and find the owned entity's copy by its position: owned entities aren't
    // snapshotted one by one
    const copy = await this.copy(tx, ownerType, owner.id, owner.id);
    const ownedCopyId = (await copy.findOwned(tx, entityType)).get(owned.position);
    if (!ownedCopyId) throw new NotFoundError(notFound);
    return new EditTarget(ownedCopyId, ownedId, copy.copiedIds);
  }

  /**
   * The row an edit of `entity` (as the engine found it in the view) writes: the ruleset's own entity, or the copy of an
   * inherited one, made on its first edit, with the customizations it copied, by their source's id (`copiedIds`). A
   * delete removes the row it answers.
   */
  async cowToEdit(
    tx: Db,
    entityType: RulesetEntityType,
    entity: { id: string; rulesetId: string },
  ): Promise<EditTarget> {
    if (entity.rulesetId === this.scope.sources.id) return new EditTarget(entity.id, entity.id);
    return await this.copy(tx, entityType, entity.id, entity.id);
  }
}
