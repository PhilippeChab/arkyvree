import type { Db } from "@/drizzle/database.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { EntityReferences, EntitySnapshots, KlassLevels, type RulesetEntityType } from "@/server/repositories/index.ts";

import EntityRepositories from "./EntityRepositories.ts";

/**
 * A fork's copy of an inherited entity reverted to its source (`EntityRevert.revert`): `EntityCopy`'s inverse. What
 * names the copy names the source instead, which the views show in its place once it's gone (`EntityReferences`): the
 * fork's own rows and its other copies', the rows of the rulesets built on it (an extension's subscribers) and their
 * characters'. A character's level in a copied class moves to the source's level of its number, as the views pair them
 * (`CowDataBuilder`), and a subscriber's copy of the copy becomes a copy of the source. Then the copy goes, with its own
 * rows (its links, a class's levels and skills) and its customizations, and its snapshot.
 */
export default class EntityRevert {
  /**
   * Moves what names a copied class's levels (a character's levels) to the source's levels of the same numbers, as the
   * views pair them. Refused while a character took a level the source doesn't have.
   */
  private static async repointKlassLevels(tx: Db, copyId: string, sourceId: string, rulesetId: string) {
    const sourceLevels = new Map((await KlassLevels.findMany(tx, { klassId: sourceId })).map((l) => [l.level, l.id]));
    const copyLevels = await KlassLevels.findMany(tx, { klassId: copyId });
    const unpaired = copyLevels.filter((level) => !sourceLevels.has(level.level)).map((level) => level.id);
    if (await EntityReferences.exists(tx, { entityType: "klass_levels", ids: unpaired, rulesetId }))
      throw new ConflictError("Cannot restore: characters took levels its parent's class doesn't have");

    for (const level of copyLevels) {
      const sourceLevelId = sourceLevels.get(level.level);
      if (!sourceLevelId) continue;
      await EntityReferences.update(
        tx,
        { entityId: sourceLevelId },
        { entityType: "klass_levels", entityId: level.id },
      );
    }
  }

  /**
   * Reverts the ruleset's copy of `sourceEntityId` (of `entityType`) to the source: a not found when the ruleset has
   * none. A copy deleted since (a tombstone) has nothing left naming it: its snapshot goes, and the source shows again.
   */
  static async revert(tx: Db, entityType: RulesetEntityType, sourceEntityId: string, rulesetId: string): Promise<void> {
    // A first edit of the entity copying it meanwhile waits, then copies it anew (`EntityCopy`)
    await EntitySnapshots.lock(tx, { rulesetId, sourceEntityId });
    const snapshot = await EntitySnapshots.findOne(tx, { rulesetId, sourceEntityId });
    if (!snapshot) throw new NotFoundError("Entity is not an override in this ruleset");

    const copyId = snapshot.forkedEntityId;
    const repository = EntityRepositories.of(entityType);
    await repository.lock(tx, { id: copyId });
    if (entityType === "klasses") await EntityRevert.repointKlassLevels(tx, copyId, sourceEntityId, rulesetId);
    await EntityReferences.update(tx, { entityId: sourceEntityId }, { entityType, entityId: copyId });
    await EntitySnapshots.update(tx, { sourceEntityId }, { sourceEntityId: copyId });
    // The database deletes its own rows with it, and its customizations
    await repository.delete(tx, { id: copyId });
    await EntitySnapshots.delete(tx, { rulesetId, sourceEntityId });
  }
}
