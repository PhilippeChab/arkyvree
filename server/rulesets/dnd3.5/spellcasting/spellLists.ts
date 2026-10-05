import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";

/** A spell list's slot at a spell level: `aptitudes.<list>.<level>.uses` or `.allowed`. */
export const SLOT_TARGET = /^aptitudes\.([^.]+)\.\d+\.(?:uses|allowed)$/;

/** A spell list whose spells join the list of the class that gives it, as a cleric's domain does: `aptitudes.<list>.joinsclasslist`. */
export const JOIN_TARGET = /^aptitudes\.([^.]+)\.joinsclasslist$/;

/** The spell list a modifier gives slots in or joins to its class's list, if it does either. */
export const listOpenedBy = (target: string): string | undefined =>
  SLOT_TARGET.exec(target)?.[1] ?? JOIN_TARGET.exec(target)?.[1];

/**
 * The spell lists the ruleset's feats give slots in or join to a class's list: a cleric's domains, a specialist wizard's
 * schools. Their spells come with the feat, never learned.
 */
export function collectFeatListIds({
  feats,
  modifiersBySource,
  aptitudeIdBySlug,
}: Pick<CachedRulesetData, "feats" | "modifiersBySource" | "aptitudeIdBySlug">): Set<string> {
  const ids = new Set<string>();
  for (const feat of feats) {
    for (const modifier of modifiersBySource.get(feat.id) ?? []) {
      const list = listOpenedBy(modifier.target);
      const id = list === undefined ? undefined : aptitudeIdBySlug.get(list);
      if (id) ids.add(id);
    }
  }
  return ids;
}
