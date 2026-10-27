import type { Db } from "@/drizzle/database.ts";
import { Engine, type OwnedKind } from "@/engine/index.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { Entities, EntityReferences, EntitySnapshots, type RulesetEntityType } from "@/server/repositories/index.ts";

import type EntityNames from "./EntityNames.ts";

/**
 * A fork's copy of an inherited entity reverted to its source (`EntityRevert.revert`): `EntityCopy`'s inverse. What
 * names the copy names the source instead, which the views show in its place once it's gone (`EntityReferences`): the
 * fork's own rows and its other copies', the rows of the rulesets built on it (an extension's subscribers) and their
 * characters'. A character's level in a copied class moves to the source's level of its number, as the views pair them
 * (`CowDataBuilder`), and a subscriber's copy of the copy becomes a copy of the source. Then the copy goes, with its own
 * rows (its links, a class's levels and skills) and its customizations, and its snapshot. A restore reverts one copy;
 * an unsubscribe reverts each of the fork's copies of the extension's entities, once nothing else of the fork names
 * them: a copy naming another (an item's copy its template's) names the extension's entity by the time the other goes,
 * so no foreign key refuses a delete, nor cascades one, whatever their order.
 */
export default class EntityRevert {
  /**
   * Moves what names a copied owner's owned entities of a kind (`ownedType`: a copied class's levels, which a
   * character's levels name) to the source's of the same positions, as the views pair them. Refused while a character
   * took one the source doesn't have.
   */
  private static async repointOwned(tx: Db, ownedType: OwnedKind, copyId: string, sourceId: string, rulesetId: string) {
    const positionsOf = (ownerId: string) => Entities.findPositions(tx, { entityType: ownedType, ownerIds: [ownerId] });
    const sourcePositions = new Map((await positionsOf(sourceId)).map((owned) => [owned.position, owned.id]));
    const copyPositions = await positionsOf(copyId);
    const unpaired = copyPositions.filter((owned) => !sourcePositions.has(owned.position)).map((owned) => owned.id);
    if (await EntityReferences.exists(tx, { entityType: ownedType, ids: unpaired, rulesetId }))
      throw new ConflictError("Cannot restore: characters took levels its parent's class doesn't have");

    for (const owned of copyPositions) {
      const sourceOwnedId = sourcePositions.get(owned.position);
      if (!sourceOwnedId) continue;
      await EntityReferences.update(tx, { entityId: sourceOwnedId }, { entityType: ownedType, entityId: owned.id });
    }
  }

  /**
   * Reverts the ruleset's copy of `sourceEntityId` (of `entityType`) to the source: a not found when the ruleset has
   * none. A copy deleted since (a tombstone) has nothing left naming it: its snapshot goes, and the source shows again.
   * A restore, whose source shows again in the ruleset's view, keeps its name free there (`names`), as a rename does; an
   * unsubscribe's revert gives none, its source leaving the view.
   */
  static async revert(
    tx: Db,
    entityType: RulesetEntityType,
    sourceEntityId: string,
    rulesetId: string,
    names?: EntityNames,
  ): Promise<void> {
    // A first edit of the entity copying it meanwhile waits, then copies it anew (`EntityCopy`)
    await EntitySnapshots.lock(tx, { rulesetId, sourceEntityId });
    const snapshot = await EntitySnapshots.findOne(tx, { rulesetId, sourceEntityId });
    if (!snapshot) throw new NotFoundError("Entity is not an override in this ruleset");

    const copyId = snapshot.forkedEntityId;
    await Entities.lock(tx, { id: copyId });
    await names?.assertRestoreAvailable(tx, entityType, sourceEntityId, copyId);
    for (const ownedType of Engine.storage().ownedKinds(entityType))
      await EntityRevert.repointOwned(tx, ownedType as OwnedKind, copyId, sourceEntityId, rulesetId);
    await EntityReferences.update(tx, { entityId: sourceEntityId }, { entityType, entityId: copyId });
    await EntitySnapshots.update(tx, { sourceEntityId }, { sourceEntityId: copyId });
    // The database deletes its own rows with it, and its customizations
    await Entities.delete(tx, { entityType, id: copyId });
    await EntitySnapshots.delete(tx, { rulesetId, sourceEntityId });
  }
}
