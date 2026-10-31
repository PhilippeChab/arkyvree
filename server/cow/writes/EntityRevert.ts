import type { Db } from "@/drizzle/database.ts";
import { Engine, type OwnedKind } from "@/engine/index.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { Entities, EntityReferences, EntitySnapshots, type RulesetEntityType } from "@/server/repositories/index.ts";

import type EntityNames from "./EntityNames.ts";
import { findOwnedPairs } from "./ownedPairs.ts";

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
    const pairs = await findOwnedPairs(tx, ownedType, new Map([[copyId, sourceId]]));
    const unpaired = [...pairs].filter(([, sourceOwnedId]) => !sourceOwnedId).map(([id]) => id);
    if (await EntityReferences.exists(tx, { ids: unpaired, rulesetId }))
      throw new ConflictError("Cannot restore: characters took levels its parent's class doesn't have");

    for (const [ownedId, sourceOwnedId] of pairs) {
      if (!sourceOwnedId) continue;
      await EntityReferences.update(tx, { entityId: sourceOwnedId }, { entityId: ownedId });
    }
  }

  /**
   * Reverts the ruleset's copy of `sourceEntityId` (of `entityType`) to the source: a not found when the ruleset has
   * none, or the source is gone (the copy is then the ruleset's own, `RulesetChanges`), which stays until the revert
   * ends. A copy deleted since (a tombstone) has nothing left naming it: its snapshot goes, and the source shows again.
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
    // The source's delete meanwhile waits: what names the copy moves to a row that stays
    const isSourceKept =
      (await Entities.lock(tx, { id: sourceEntityId }, "share")) &&
      (await Entities.has(tx, { entityType, id: sourceEntityId }));
    if (!snapshot || !isSourceKept) throw new NotFoundError("Entity is not an override in this ruleset");

    const copyId = snapshot.forkedEntityId;
    await Entities.lock(tx, { id: copyId });
    await names?.assertRestoreAvailable(tx, entityType, sourceEntityId, copyId);
    for (const ownedType of Engine.storage().ownedKinds(entityType))
      await EntityRevert.repointOwned(tx, ownedType as OwnedKind, copyId, sourceEntityId, rulesetId);
    await EntityReferences.update(tx, { entityId: sourceEntityId }, { entityId: copyId });
    await EntitySnapshots.update(tx, { sourceEntityId }, { sourceEntityId: copyId });
    // The database deletes its own rows with it, and its customizations
    await Entities.delete(tx, { entityType, id: copyId });
    await EntitySnapshots.delete(tx, { rulesetId, sourceEntityId });
  }
}
