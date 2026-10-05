import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";

/** A spell list's slot at a spell level: `aptitudes.<list>.<level>.uses` or `.allowed`. */
export const SLOT_TARGET = /^aptitudes\.([^.]+)\.\d+\.(?:uses|allowed)$/;

/** A spell list whose spells join the list of the class that gives it, as a cleric's domain does: `aptitudes.<list>.joinsclasslist`. */
export const JOIN_TARGET = /^aptitudes\.([^.]+)\.joinsclasslist$/;

/** The spell list a modifier gives slots in or joins to its class's list, if it does either. */
export function listOpenedBy(target: string): string | undefined {
  return SLOT_TARGET.exec(target)?.[1] ?? JOIN_TARGET.exec(target)?.[1];
}

/**
 * Each class's spell lists, by its id: those its levels give slots in, a level no character has taken yet included (a
 * paladin's before his fourth), each with spells on it or none yet (a divine crusader's: her domain's join it).
 */
export function collectClassLists({
  klassLevels,
  modifiersBySource,
}: Pick<CachedRulesetData, "klassLevels" | "modifiersBySource">): Map<string, Set<string>> {
  const listsByKlassId = new Map<string, Set<string>>();
  for (const klassLevel of klassLevels) {
    for (const modifier of modifiersBySource.get(klassLevel.id) ?? []) {
      const list = SLOT_TARGET.exec(modifier.target)?.[1];
      if (list === undefined) continue;
      const lists = listsByKlassId.get(klassLevel.klassId) ?? new Set<string>();
      lists.add(list);
      listsByKlassId.set(klassLevel.klassId, lists);
    }
  }
  return listsByKlassId;
}

/** The spell lists the ruleset's class levels give slots in, by aptitude id: each a class's own (`collectClassLists`). */
export function collectClassListIds(
  rulesetData: Pick<CachedRulesetData, "klassLevels" | "modifiersBySource" | "aptitudeIdBySlug">,
): Set<string> {
  const ids = new Set<string>();
  for (const lists of collectClassLists(rulesetData).values()) {
    for (const list of lists) {
      const id = rulesetData.aptitudeIdBySlug.get(list);
      if (id) ids.add(id);
    }
  }
  return ids;
}

/**
 * The spell lists a feat brings: those the ruleset's feats give slots in or join to a class's list, and no class gives
 * slots in (a cleric's domains, a specialist wizard's schools; a feat's extra slot in a class's own list leaves it the
 * class's). Their spells come with the feat, never learned; their slots follow the feat's class's spell levels.
 */
export function collectFeatListIds(
  rulesetData: Pick<CachedRulesetData, "feats" | "klassLevels" | "modifiersBySource" | "aptitudeIdBySlug">,
): Set<string> {
  const { feats, modifiersBySource, aptitudeIdBySlug } = rulesetData;
  const classListIds = collectClassListIds(rulesetData);
  const ids = new Set<string>();
  for (const feat of feats) {
    for (const modifier of modifiersBySource.get(feat.id) ?? []) {
      const list = listOpenedBy(modifier.target);
      const id = list === undefined ? undefined : aptitudeIdBySlug.get(list);
      if (id && !classListIds.has(id)) ids.add(id);
    }
  }
  return ids;
}
