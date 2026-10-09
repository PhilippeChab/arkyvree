/** The feats and powers a character's modifiers make it possess without a pick. */

import type { RulesetData } from "@/engine/core/view/index.ts";
import FeatsPaths from "@/engine/rulesets/dnd3.5/model/feats/FeatsPaths.ts";
import PowersPaths from "@/engine/rulesets/dnd3.5/model/powers/PowersPaths.ts";
import { toSpellPossessionSlug } from "@/shared/dnd3.5/spells.ts";
import type { Modifier, PowerWithAptitudes } from "@/shared/relations.ts";

/**
 * Scans modifiers for "set feats.<slug>.possessed = true" targets and returns
 * the IDs of the possessed feats that aren't already in the character's feat list.
 */
function resolvePossessedFeatIds(
  modifiers: Modifier[],
  existingFeatIds: Set<string>,
  featIdBySlug: Map<string, string>,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const mod of modifiers) {
    if (mod.operator !== "set" || mod.valueType !== "boolean" || mod.value !== "true") continue;
    const slug = FeatsPaths.parsePossessed(mod.target);
    if (slug === undefined) continue;
    const featId = featIdBySlug.get(slug);
    if (!featId || existingFeatIds.has(featId) || seen.has(featId)) continue;
    seen.add(featId);
    ids.push(featId);
  }
  return ids;
}

function resolvePossessedPowers(
  modifiers: Modifier[],
  existingPowerIds: Set<string>,
  powerIdsBySlug: Map<string, string[]>,
  powersById: Map<string, PowerWithAptitudes>,
  aptitudeIdBySpellSlug: Map<string, string>,
): { aptitudeId: string; powerId: string }[] {
  const results: { aptitudeId: string; powerId: string }[] = [];
  for (const mod of modifiers) {
    if (mod.operator !== "set" || mod.valueType !== "boolean" || mod.value !== "true") continue;
    const known = PowersPaths.parseKnown(mod.target);
    if (!known) continue;
    const aptitudeId = aptitudeIdBySpellSlug.get(known.list);
    if (!aptitudeId) continue;
    const candidateIds = powerIdsBySlug.get(known.spell);
    if (!candidateIds) continue;
    for (const id of candidateIds) {
      const power = powersById.get(id);
      if (!power) continue;
      if (!power.powersAptitudesInRules.some((pa) => pa.aptitudeId === aptitudeId)) continue;
      if (existingPowerIds.has(power.id)) break;
      results.push({ powerId: power.id, aptitudeId });
      break;
    }
  }
  return results;
}

/** What a character possesses virtually: the feats and powers its modifiers give it. */
export default class Possessions {
  /** The feats and powers the character's modifiers make it possess without a pick (`set feats.<slug>.possessed`). */
  static resolveVirtual(baseModifiers: Modifier[], featIds: string[], powerIds: string[], rulesetData: RulesetData) {
    return {
      virtuallyPossessedFeatIds: resolvePossessedFeatIds(baseModifiers, new Set(featIds), rulesetData.featIdBySlug),
      virtuallyPossessedPowers: resolvePossessedPowers(
        baseModifiers,
        new Set(powerIds),
        rulesetData.powerIdsBySlug,
        rulesetData.powersById,
        new Map(rulesetData.aptitudes.map((apt) => [toSpellPossessionSlug(apt.name), apt.id])),
      ),
    };
  }
}
