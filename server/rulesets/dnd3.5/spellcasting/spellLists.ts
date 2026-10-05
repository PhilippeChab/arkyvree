import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";

/** A spell list's slot at a spell level: `aptitudes.<list>.<level>.uses` or `.allowed`. */
export const SLOT_TARGET = /^aptitudes\.([^.]+)\.\d+\.(?:uses|allowed)$/;

/** A spell list whose spells join the list of the class that gives it, as a cleric's domain does: `aptitudes.<list>.joinsclasslist`. */
export const JOIN_TARGET = /^aptitudes\.([^.]+)\.joinsclasslist$/;

/** The spell list a modifier gives slots in or joins to its class's list, if it does either. */
export const listOpenedBy = (target: string): string | undefined =>
  SLOT_TARGET.exec(target)?.[1] ?? JOIN_TARGET.exec(target)?.[1];

/**
 * The spell lists the ruleset's class levels give slots in: each a class's own, with spells on it or none yet. A divine
 * crusader's has none: her domain's join it.
 */
export function collectClassListIds({
  klassLevels,
  modifiersBySource,
  aptitudeIdBySlug,
}: Pick<CachedRulesetData, "klassLevels" | "modifiersBySource" | "aptitudeIdBySlug">): Set<string> {
  const ids = new Set<string>();
  for (const klassLevel of klassLevels) {
    for (const modifier of modifiersBySource.get(klassLevel.id) ?? []) {
      const list = SLOT_TARGET.exec(modifier.target)?.[1];
      const id = list === undefined ? undefined : aptitudeIdBySlug.get(list);
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
