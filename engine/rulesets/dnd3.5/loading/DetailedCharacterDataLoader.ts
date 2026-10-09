import { type CharacterRows } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type SkillFieldValues } from "@/engine/rulesets/dnd3.5/skills/SkillFields.ts";
import { type Dnd35ProjectedCharacterData, type LoadedCharacterData } from "@/engine/rulesets/dnd3.5/types.ts";
import type { Character, Modifier, Requirement } from "@/shared/relations.ts";

import Customizations from "./Customizations.ts";
import Picks from "./Picks.ts";
import Possessions from "./Possessions.ts";
import RulesetReadings from "./RulesetReadings.ts";

/** D&D 3.5-specific extension of LoadedCharacterData with spellcasting and skill properties. */
export interface Dnd35LoadedCharacterData extends LoadedCharacterData {
  klassBonusSpellAbilityMap: Map<string, string>;
  klassCasterTypeMap: Map<string, "Arcane" | "Divine">;
  klassLevelProperties: Map<string, { bab: number; skills: number }>;
  skillFields: Map<string, SkillFieldValues>;
  skillPointAbilityId: string | null;
}

/** Resolves stored ids through the override map, when there is one. */
export type Resolve = <T extends Record<string, unknown>>(rows: T[]) => T[];

export default class DetailedCharacterDataLoader {
  constructor(private readonly character: Character) {}

  /**
   * The modifiers of the character's sources: every ruleset entity's from the view (`modifiersBySource`), then the
   * character's own (`rows.modifiers`, sourced on the character's id), which the view can't hold, and their requirements.
   * The flat list `resolveVirtualPossessions` scans for the feats and powers a modifier makes the character possess.
   */
  private collectSourceModifiers(rows: CharacterRows, rulesetData: RulesetData, sourceIds: string[]) {
    const baseModifiers: Modifier[] = [];
    for (const id of sourceIds) {
      const group = rulesetData.modifiersBySource.get(id);
      if (group) baseModifiers.push(...group);
    }
    baseModifiers.push(...rows.modifiers);
    const extraRequirements: Requirement[] = rows.requirements;
    return { characterSourcedModifiers: rows.modifiers, baseModifiers, extraRequirements };
  }

  /** The character's data, assembled from its rows (`rows`) and its ruleset's `view`, with a level-up's projection. */
  load(rows: CharacterRows, view: RulesetView, projectedData?: Dnd35ProjectedCharacterData): Dnd35LoadedCharacterData {
    const { ruleset, rulesetData } = view;
    const { player, campaign } = rows;
    const cowData = rulesetData.cow;
    // The character's race, from the view: racesById resolves a stored id (RulesetComposition)
    const race = rulesetData.racesById.get(this.character.raceId);
    if (!race) throw new Error("Race not found");

    const resolve: Resolve = (rows) => cowData.resolveRows(rows);
    const abilityLookup = new Map(rulesetData.abilities.map((a) => [a.id, a.name]));
    const levels = Picks.resolveLevels(rows.levels, projectedData, resolve);

    // The join uses the stored item ID. Load the effective item so COW changes
    // refresh its name and other fields, not just its ID.
    const resolvedInventory = rows.inventory.map((inv) => ({
      ...inv,
      itemsInRule: rulesetData.itemsById.get(inv.itemId) ?? inv.itemsInRule,
    }));
    const { languages, klassLevelsRaw, klassLevelSaves, klasses, klassSkills, klassEntityIds } =
      RulesetReadings.readCachedRows(rows, rulesetData, levels.klassLevelIds);

    const { skills, allFeats, klassLevelFeatCountsByAptitudeId, allPowers, klassLevelPowerCountsByAptitudeId } =
      Picks.buildPicks(rows.picks, rulesetData, projectedData, levels, resolve);
    const featIds = allFeats.map((feat) => feat.id);
    const powerIds = allPowers.map((power) => power.id);

    const equippedItemIds = resolvedInventory.filter((inv) => inv.equipped).map((inv) => inv.itemsInRule.id);
    const { characterSourcedModifiers, baseModifiers, extraRequirements } = this.collectSourceModifiers(
      rows,
      rulesetData,
      [race.id, ...equippedItemIds, ...klassEntityIds, ...levels.klassLevelIds, ...featIds, ...powerIds],
    );

    // Round 5b: the modifiers of virtually possessed feats and powers.
    const { virtuallyPossessedFeatIds, virtuallyPossessedPowers } = Possessions.resolveVirtual(
      baseModifiers,
      featIds,
      powerIds,
      rulesetData,
    );

    // Each entity's customizations: per-entity lookups resolve via the cache's pre-built Maps.
    const { klassLevels, klassLevelProperties } = Customizations.toCustomizedKlassLevels(klassLevelsRaw, rulesetData);
    const parts = {
      characterSourcedModifiers,
      race: Customizations.toCustomizedRace(race, rulesetData),
      inventory: Customizations.toCustomizedInventory(resolvedInventory, rulesetData),
      klassLevels,
      klassEntityIds,
      feats: Customizations.toCustomizedFeats(allFeats, virtuallyPossessedFeatIds, rulesetData),
      powers: Customizations.toCustomizedPowers(allPowers, virtuallyPossessedPowers, rulesetData),
    };
    const { modifiers, requirementGroups } = Customizations.collectModifiers(parts, rulesetData, extraRequirements);

    return {
      ruleset,
      player,
      campaign,
      ...RulesetReadings.readRulesetLists(rulesetData),
      ...RulesetReadings.readRulesetProperties(rulesetData, (id) => cowData.resolve(id)),
      characterAbilityScores: resolve(rows.abilities).map((ca) => RulesetReadings.buildAbilityScore(ca, abilityLookup)),
      race: parts.race,
      languages,
      inventory: parts.inventory,
      characterLevels: levels.allCharacterLevels,
      klassLevels,
      klassSkills,
      klassLevelSaves,
      klasses,
      feats: parts.feats,
      skills,
      powers: parts.powers,
      klassLevelFeatCountsByAptitudeId,
      klassLevelPowerCountsByAptitudeId,
      klassLevelProperties,
      modifiers,
      requirementGroups,
      validRulesetIds: new Set([this.character.rulesetId, ...cowData.sourceChain]),
      ...RulesetReadings.readKlassProperties(klassEntityIds, rulesetData, abilityLookup),
    };
  }
}
