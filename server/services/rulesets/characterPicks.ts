import type { Db } from "@/drizzle/database.ts";
import { EntityReferences, KlassLevels, type ReferencedType } from "@/server/repositories/index.ts";

/**
 * Whether a character on `rulesetId`, or on a ruleset built on it (a fork of it, or a ruleset subscribing to it as an
 * extension), names the entity by any of `ids` (`EntityReferences.exists`): its equivalents in the ruleset's view
 * (`CowData.getEquivalentIds`, since a pick stored before the entity was copied names its source). A class by any of
 * its levels. The in-use guard of what would hard-delete an entity: the entity-delete services, a class level's or a
 * class skill's removal.
 */
export async function hasCharacterPicks(
  tx: Db,
  entityType: ReferencedType,
  ids: string[],
  rulesetId: string,
): Promise<boolean> {
  if (entityType !== "klasses") return await EntityReferences.exists(tx, { entityType, ids, rulesetId });
  const levels = await KlassLevels.findMany(tx, { klassIds: ids });
  return await EntityReferences.exists(tx, {
    entityType: "klass_levels",
    ids: levels.map((level) => level.id),
    rulesetId,
  });
}
