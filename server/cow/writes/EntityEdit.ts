import type { Db } from "@/drizzle/database.ts";
import { type CowData, Engine, type RulesetSources } from "@/engine/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Entities, type RulesetEntityType } from "@/server/repositories/index.ts";

import EditTarget from "./EditTarget.ts";
import EntityCopy from "./EntityCopy.ts";

/**
 * What a write refuses an entity it can't find with, in its own words (an entity's, a customization's source): one the
 * view doesn't show, or shows from outside the source chain (`missing`), and one deleted since the view was read
 * (`gone`).
 */
export interface NotFoundMessages {
  gone: string;
  missing: string;
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

  /**
   * Locks an entity a change writes under (its customizations, its delete), by its stored id: a not found when gone,
   * saying so in the change's words (`gone`).
   */
  static async lock(tx: Db, entityId: string, gone: string): Promise<void> {
    if (!(await Entities.lock(tx, { id: entityId }))) throw new NotFoundError(gone);
  }

  /**
   * The copy of an inherited entity (`entityId`, of `entityType`), made on its first edit, as the target of a write that
   * named it `namedId`: with what it copied.
   */
  private async copy(tx: Db, entityType: RulesetEntityType, entityId: string, namedId: string): Promise<EditTarget> {
    const copy = await EntityCopy.create(tx, entityType, entityId, this.ruleset);
    return new EditTarget(copy.entity.id, namedId, copy.copiedIds);
  }

  /**
   * The row a write to the entity the view shows for an id changes (`entityId`, of `entityType`), resolved through the
   * view: the ruleset's own, locked, or the copy of an inherited one; an owned entity's on its owner's (`cowOwned`).
   * Refused as not found, in the write's words (`notFound`: a customization's source's, an entity's), when the view
   * shows none, or shows one from outside the source chain, or the entity was deleted since.
   */
  async cowById(tx: Db, entityType: string, entityId: string, notFound: NotFoundMessages): Promise<EditTarget> {
    const ownerType = Engine.storage().ownerOf(entityType);
    if (ownerType) return await this.cowOwned(tx, entityType, ownerType as RulesetEntityType, entityId, notFound);

    const type = entityType as RulesetEntityType;
    // The entity the view shows for the id: the ruleset's copy of it, or the winner of its siblings
    const entity = await Entities.findOne(tx, { entityType: type, id: this.cow.resolve(entityId) });
    if (!entity) throw new NotFoundError(notFound.missing);

    if (entity.rulesetId === this.ruleset.id) {
      await EntityEdit.lock(tx, entity.id, notFound.gone);
      return new EditTarget(entity.id, entityId);
    }
    // Not from the source chain
    if (!this.cow.sourceChain.includes(entity.rulesetId)) throw new NotFoundError(notFound.missing);

    return await this.copy(tx, type, entity.id, entityId);
  }

  /**
   * The row an owned entity's write changes (`ownedId`, of `entityType`, owned by `ownerType`: a class level, by its
   * class): its own, its owner locked so the write waits on other writes of it, or, its owner inherited, its copy's of
   * its position, the owner copied with what it owns. Refused as not found, in the write's words (`notFound`), when the
   * view shows none, or when the owner or the owned entity was deleted while the write waited on its owner.
   */
  async cowOwned(
    tx: Db,
    entityType: string,
    ownerType: RulesetEntityType,
    ownedId: string,
    notFound: NotFoundMessages,
  ): Promise<EditTarget> {
    // The owned entity the view shows for the id, and its owner
    const [owned] = await Entities.findPositions(tx, { entityType, ids: [this.cow.resolve(ownedId)] });
    if (!owned) throw new NotFoundError(notFound.missing);

    const owner = await Entities.findOne(tx, { entityType: ownerType, id: this.cow.resolve(owned.ownerId) });
    if (!owner) throw new NotFoundError(notFound.missing);
    const ownerRulesetId = String(owner.rulesetId);

    if (ownerRulesetId === this.ruleset.id) {
      await EntityEdit.lock(tx, owner.id, notFound.gone);
      if (!(await Entities.findOne(tx, { entityType, id: owned.id }))) throw new NotFoundError(notFound.gone);

      return new EditTarget(owned.id, ownedId);
    }
    // Not from the source chain
    if (!this.cow.sourceChain.includes(ownerRulesetId)) throw new NotFoundError(notFound.missing);

    // Copy the owner (it copies what it owns), and find the owned entity's copy by its position: owned entities aren't
    // snapshotted one by one
    const copy = await this.copy(tx, ownerType, owner.id, owner.id);
    const ownedCopyId = (await copy.findOwned(tx, entityType)).get(owned.position);
    if (!ownedCopyId) throw new NotFoundError("Copied owned entity not found");
    return new EditTarget(ownedCopyId, ownedId, copy.copiedIds);
  }

  /**
   * The row a delete of `entity` removes: as `cowToEdit`, and the ruleset's own entity is locked first, so its
   * customizations' writes wait for the delete; refused as not found, in the delete's words (`gone`), when it was
   * deleted since.
   */
  async cowToDelete(
    tx: Db,
    entityType: RulesetEntityType,
    entity: { id: string; rulesetId: string },
    gone: string,
  ): Promise<string> {
    const target = await this.cowToEdit(tx, entityType, entity);
    if (!target.copied) await EntityEdit.lock(tx, target.id, gone);
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
    if (entity.rulesetId === this.ruleset.id) return new EditTarget(entity.id, entity.id);
    return await this.copy(tx, entityType, entity.id, entity.id);
  }
}
