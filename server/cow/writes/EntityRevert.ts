import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules } from "@/drizzle/schema.ts";
import { Engine, type OwnedKind } from "@/engine/index.ts";
import type { LockedRulesetScope } from "@/server/cow/views/scope.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import {
  Entities,
  EntityReferences,
  EntitySnapshots,
  Locks,
  type RulesetEntityType,
} from "@/server/repositories/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

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
   * What refuses a restore whose owner (`entityType`) has owned entities of a kind (`ownedType`) a character took and
   * its source doesn't have, in the rules' words.
   */
  private static refuseTakenOwned(baseRules: BaseRules, entityType: string, ownedType: OwnedKind) {
    return new ConflictError(Engine.rules().describeTakenOwned(baseRules, ownedType, entityType));
  }

  /**
   * Moves what names a copied owner's owned entities of a kind (`ownedType`: a copied class's levels, which a
   * character's levels name) to the source's of the same positions, as the views pair them. Refused while a character
   * took one the source doesn't have.
   */
  private static async repointOwned(
    tx: Db,
    entityType: string,
    ownedType: OwnedKind,
    copyId: string,
    sourceId: string,
    { baseRules, id: rulesetId }: LockedRulesetScope["ruleset"],
  ) {
    const pairs = await findOwnedPairs(tx, ownedType, new Map([[copyId, sourceId]]));
    const unpaired = [...pairs].filter(([, sourceOwnedId]) => !sourceOwnedId).map(([id]) => id);
    if (await EntityReferences.exists(tx, { ids: unpaired, rulesetId }))
      throw EntityRevert.refuseTakenOwned(baseRules, entityType, ownedType);

    for (const [ownedId, sourceOwnedId] of pairs) {
      if (!sourceOwnedId) continue;
      await EntityReferences.update(tx, { entityId: sourceOwnedId }, { entityId: ownedId });
    }
  }

  /**
   * Reverts the copy of `sourceEntityId` (of `entityType`) of the ruleset a write holds (`scope`, under its lock: no
   * other write of it, nor of its source chain, where the source is, runs meanwhile) to the source: a not found when
   * the ruleset has none, or the source is gone (the copy is then the ruleset's own, `RulesetChanges`). A copy deleted
   * since (a tombstone) has nothing left naming it: its snapshot goes, and the source shows again. A restore, whose
   * source shows again in the ruleset's view, keeps its name free there (`names`), as a rename does; an unsubscribe's
   * revert gives none, its source leaving the view.
   */
  static async revert(
    tx: Db,
    entityType: RulesetEntityType,
    sourceEntityId: string,
    scope: LockedRulesetScope,
    names?: EntityNames,
  ): Promise<void> {
    const rulesetId = scope.ruleset.id;
    const snapshot = await EntitySnapshots.findOne(tx, { rulesetId, sourceEntityId });
    if (!snapshot || !(await Entities.has(tx, { entityType, id: sourceEntityId })))
      throw new NotFoundError("Entity is not an override in this ruleset");

    const copyId = snapshot.forkedEntityId;
    // The copy's row locked before what names it moves: a character's write that names an entity holds its ruleset's
    // chain shared, so it never runs alongside, but what else names the copy by its foreign key (which holds it
    // shared) commits first, so it moves with the rest, and the delete never meets it
    await Locks.lockRow(tx, entitiesInRules, copyId, "update");
    await names?.assertRestoreAvailable(tx, entityType, sourceEntityId, copyId);
    for (const ownedType of Engine.storage(scope.ruleset.baseRules).ownedKinds(entityType))
      await EntityRevert.repointOwned(tx, entityType, ownedType as OwnedKind, copyId, sourceEntityId, scope.ruleset);
    await EntityReferences.update(tx, { entityId: sourceEntityId }, { entityId: copyId });
    await EntitySnapshots.update(tx, { sourceEntityId }, { sourceEntityId: copyId });
    // The database deletes its own rows with it, and its customizations
    await Entities.delete(tx, { entityType, id: copyId });
    await EntitySnapshots.delete(tx, { rulesetId, sourceEntityId });
  }
}
