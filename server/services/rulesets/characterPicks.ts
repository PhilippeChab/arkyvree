import type { Db } from "@/drizzle/database.ts";
import { Entities, EntityReferences, type ReferencedType } from "@/server/repositories/index.ts";

/**
 * Whether a character on `rulesetId`, or on a ruleset built on it (a fork of it, or a ruleset subscribing to it as an
 * extension), names the entity by any of `ids` (`EntityReferences.exists`): its equivalents in the ruleset's view
 * (`CowData.getEquivalentIds`, since a pick stored before the entity was copied names its source), or an entity it
 * owns, which goes with it (a class's level). The in-use guard of what would hard-delete an entity: the entity-delete
 * services, an owned entity's or a join's removal.
 */
export async function hasCharacterPicks(
  tx: Db,
  entityType: ReferencedType,
  ids: string[],
  rulesetId: string,
): Promise<boolean> {
  const owned = await Entities.findOwned(tx, { ownerIds: ids, ownerType: entityType });
  return await EntityReferences.exists(tx, {
    entityType,
    ids: [...ids, ...owned.map((entity) => entity.id)],
    rulesetId,
  });
}
