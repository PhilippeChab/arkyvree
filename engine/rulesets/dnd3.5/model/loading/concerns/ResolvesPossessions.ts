import type { CharacterDataLoader } from "@/engine/core/character/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import FeatsPaths from "@/engine/rulesets/dnd3.5/model/feats/FeatsPaths.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import PowersPaths from "@/engine/rulesets/dnd3.5/model/powers/PowersPaths.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/rules/SpellLists.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { Modifier, PowerWithAptitudes } from "@/shared/relations.ts";

/** The feats modifiers make possessed ("set feats.<slug>.possessed = true"), each once, in the order they give them. */
function resolvePossessedFeatIds(modifiers: Modifier[], featIdBySlug: Map<string, string>): string[] {
  const ids = new Set<string>();
  for (const mod of modifiers) {
    if (mod.operator !== "set" || mod.valueType !== "boolean" || mod.value !== "true") continue;
    const slug = FeatsPaths.parsePossessed(mod.target);
    if (slug === undefined) continue;
    const featId = featIdBySlug.get(slug);
    if (featId) ids.add(featId);
  }
  return [...ids];
}

/**
 * The spells modifiers make known ("set powers.<spell>.<list>.known = true"), each on its list once, in the order they
 * give them: a spell is known once per list, and another list may know it too.
 */
function resolvePossessedPowers(
  modifiers: Modifier[],
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
    // The first of the spell's rows on the list
    const power = powerIdsBySlug
      .get(known.spell)
      ?.map((id) => powersById.get(id))
      .find((row) => row?.powersAptitudesInRules.some((pa) => pa.aptitudeId === aptitudeId));
    if (!power || seen.has(`${power.id}:${aptitudeId}`)) continue;
    seen.add(`${power.id}:${aptitudeId}`);
    results.push({ powerId: power.id, aptitudeId });
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
     * feat the character holds already (`featIds`) isn't possessed again, and a power is made known on a list that
     * doesn't know it already (`heldPowers`, each on its list), whatever other list does. With every feat and power
     * (`<power id>:<list id>`) the modifiers give, held already or not (`givenFeatIds`, `givenPowerKeys`): whether a
     * level's pick is another pick's gift (`SelectionChecks`).
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
      const givenFeatIds = new Set<string>();
      const givenPowerKeys = new Set<string>();
      let scanned = [...sourceIds.flatMap((id) => rulesetData.modifiersBySource.get(id) ?? []), ...ownModifiers];
      while (scanned.length > 0) {
        const given = {
          feats: resolvePossessedFeatIds(scanned, rulesetData.featIdBySlug),
          powers: resolvePossessedPowers(
            scanned,
            rulesetData.powerIdsBySlug,
            rulesetData.powersById,
            aptitudeIdBySpellSlug,
          ),
        };
        for (const featId of given.feats) givenFeatIds.add(featId);
        for (const { aptitudeId, powerId } of given.powers) givenPowerKeys.add(`${powerId}:${aptitudeId}`);
        const feats = given.feats.filter((featId) => !heldFeatIds.has(featId));
        const powers = given.powers.filter(({ aptitudeId, powerId }) => !knownOn.has(`${powerId}:${aptitudeId}`));
        for (const featId of feats) heldFeatIds.add(featId);
        for (const { aptitudeId, powerId } of powers) knownOn.add(`${powerId}:${aptitudeId}`);
        virtuallyPossessedFeatIds.push(...feats);
        virtuallyPossessedPowers.push(...powers);
        scanned = [...feats, ...powers.map(({ powerId }) => powerId)].flatMap(
          (id) => rulesetData.modifiersBySource.get(id) ?? [],
        );
      }
      return { givenFeatIds, givenPowerKeys, virtuallyPossessedFeatIds, virtuallyPossessedPowers };
    }
  }

  return ResolvingPossessions;
}
