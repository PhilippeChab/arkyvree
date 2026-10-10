import type { CharacterDataLoader } from "@/engine/core/character/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import FeatsPaths from "@/engine/rulesets/dnd3.5/model/feats/FeatsPaths.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import PowersPaths from "@/engine/rulesets/dnd3.5/model/powers/PowersPaths.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/rules/SpellLists.ts";
import type { Constructor } from "@/lib/mixins.ts";
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

/**
 * Scans modifiers for "set powers.<spell>.<list>.known = true" targets and returns each spell they make known on its
 * list once, but where the list knows it already (`knownOn`, by `<power id>:<list id>`): a spell is known once per
 * list, and another list may know it too.
 */
function resolvePossessedPowers(
  modifiers: Modifier[],
  knownOn: Set<string>,
  powerIdsBySlug: Map<string, string[]>,
  powersById: Map<string, PowerWithAptitudes>,
  aptitudeIdBySpellSlug: Map<string, string>,
): { aptitudeId: string; powerId: string }[] {
  const results: { aptitudeId: string; powerId: string }[] = [];
  const seen = new Set<string>();
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
      const key = `${power.id}:${aptitudeId}`;
      if (knownOn.has(key) || seen.has(key)) break;
      seen.add(key);
      results.push({ powerId: power.id, aptitudeId });
      break;
    }
  }
  return results;
}

/** What a character possesses virtually: the feats and powers its modifiers give it. */
export function ResolvesPossessions<B extends Constructor<CharacterDataLoader<LoadedCharacterData>>>(Base: B) {
  abstract class ResolvingPossessions extends Base {
    /**
     * The feats and powers the character's modifiers make it possess without a pick (`set feats.<slug>.possessed`,
     * `set powers.<spell>.<list>.known`): those its sources' modifiers grant (`sourceIds`' from the view, then the
     * character's own, `ownModifiers`), then those the granted ones' own modifiers grant, until a pass grants none. A
     * power is made known on a list that doesn't know it already (`heldPowers`, each on its list), whatever other list
     * does.
     */
    protected resolveVirtualPossessions(
      ownModifiers: Modifier[],
      sourceIds: string[],
      featIds: string[],
      heldPowers: { aptitudeId: string; id: string }[],
      rulesetData: RulesetData,
    ) {
      const virtuallyPossessedFeatIds: string[] = [];
      const virtuallyPossessedPowers: { aptitudeId: string; powerId: string }[] = [];
      const heldFeatIds = new Set(featIds);
      const knownOn = new Set(heldPowers.map(({ aptitudeId, id }) => `${id}:${aptitudeId}`));
      const { aptitudeIdBySpellSlug } = SpellLists.of(rulesetData);
      let scanned = [...sourceIds.flatMap((id) => rulesetData.modifiersBySource.get(id) ?? []), ...ownModifiers];
      while (scanned.length > 0) {
        const feats = resolvePossessedFeatIds(scanned, heldFeatIds, rulesetData.featIdBySlug);
        const powers = resolvePossessedPowers(
          scanned,
          knownOn,
          rulesetData.powerIdsBySlug,
          rulesetData.powersById,
          aptitudeIdBySpellSlug,
        );
        for (const featId of feats) heldFeatIds.add(featId);
        for (const { aptitudeId, powerId } of powers) knownOn.add(`${powerId}:${aptitudeId}`);
        virtuallyPossessedFeatIds.push(...feats);
        virtuallyPossessedPowers.push(...powers);
        scanned = [...feats, ...powers.map(({ powerId }) => powerId)].flatMap(
          (id) => rulesetData.modifiersBySource.get(id) ?? [],
        );
      }
      return { virtuallyPossessedFeatIds, virtuallyPossessedPowers };
    }
  }

  return ResolvingPossessions;
}
