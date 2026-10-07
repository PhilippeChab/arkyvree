import { type CowData } from "@/engine/core/cow/index.ts";
import type { LoadedCharacterData, PreloadedCharacterData, PreloadedRulesetData } from "@/engine/core/types.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { db, type Db } from "@/server/database/index.ts";
import {
  Campaigns,
  CharacterAbilities,
  CharacterInventory as CharacterInventoryRepository,
  CharacterLanguages,
  CharacterLevels,
  Modifiers,
  PlayerCharacters,
  Players,
  Requirements,
} from "@/server/repositories/index.ts";
import type { Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/types.ts";
import type { SkillFields } from "@/server/rulesets/engine/module/index.ts";
import type { Campaign, Character, CharacterLevel, Modifier, Player, Race, Ruleset } from "@/shared/relations.ts";

import {
  collectModifiers,
  toCustomizedFeats,
  toCustomizedInventory,
  toCustomizedKlassLevels,
  toCustomizedPowers,
  toCustomizedRace,
} from "./customizations.ts";
import { buildPicks, fetchPicks, resolveLevels } from "./picks.ts";
import { resolveVirtualPossessions } from "./possessions.ts";
import {
  buildAbilityScore,
  readCachedRows,
  readKlassProperties,
  readRulesetLists,
  readRulesetProperties,
} from "./rulesetReadings.ts";

/** D&D 3.5-specific extension of LoadedCharacterData with spellcasting and skill properties. */
export interface Dnd35LoadedCharacterData extends LoadedCharacterData {
  klassBonusSpellAbilityMap: Map<string, string>;
  klassCasterTypeMap: Map<string, "Arcane" | "Divine">;
  klassLevelProperties: Map<string, { bab: number; skills: number }>;
  skillFields: Map<string, SkillFields>;
  skillPointAbilityId: string | null;
}

/** Resolves stored ids through the override map, when there is one. */
export type Resolve = <T extends Record<string, unknown>>(rows: T[]) => T[];

/** Internal bag of rounds 1-3 DB results shared across projected/baseline builds. */
export interface SharedCharacterData {
  campaign: Campaign | undefined;
  characterAbilityRecords: Awaited<ReturnType<typeof CharacterAbilities.findMany>>;
  characterLanguages: Awaited<ReturnType<typeof CharacterLanguages.findMany>>;
  cowData: CowData;
  inventory: Awaited<ReturnType<typeof CharacterInventoryRepository.findMany>>;
  player: Player | undefined;
  race: Race;
  rawCharacterLevels: CharacterLevel[];
  ruleset: Ruleset;
  rulesetData: RulesetData;
}

export default class DetailedCharacterDataLoader {
  constructor(private readonly character: Character) {}

  /**
   * Round 5: character-sourced modifiers only. Every ruleset-scoped property/modifier/requirement is already indexed
   * on rulesetData (propertiesByEntity, modifiersBySource, requirementsByEntity). The only pieces the cache can't know
   * about are character-sourced modifiers (their sourceId is the character ID, not a ruleset entity). With them, the
   * flat modifier list scoped to this character — used by resolvePossessedFeatIds / resolvePossessedPowers (which
   * scan for "set feats/powers.<slug>.possessed/known" targets). Built by O(entities) map lookups, not an O(all ruleset
   * mods) filter. Then the requirements of the character's own modifiers.
   */
  private async fetchModifiers(database: Db, rulesetData: RulesetData, sourceIds: string[]) {
    const characterSourcedModifiers = await Modifiers.findMany(database, {
      sourceIds: [this.character.id],
    });
    const baseModifiers: Modifier[] = [];
    for (const id of sourceIds) {
      const group = rulesetData.modifiersBySource.get(id);
      if (group) baseModifiers.push(...group);
    }
    baseModifiers.push(...characterSourcedModifiers);

    // Round 6: Requirements — cache covers ruleset modifiers (including those on virtually possessed feats/powers,
    // since the unified `feats` and `powers` arrays pull from `rulesetData.modifiersBySource`). Only
    // character-direct modifiers can have requirements the cache misses.
    const extraRequirements = await Requirements.findMany(database, {
      entityIds: characterSourcedModifiers.map((m) => m.id),
    });
    return { characterSourcedModifiers, baseModifiers, extraRequirements };
  }

  async load(
    database: Db = db,
    projectedData?: Dnd35ProjectedCharacterData,
    preloaded?: PreloadedCharacterData | PreloadedRulesetData,
  ): Promise<Dnd35LoadedCharacterData> {
    if (!preloaded)
      throw new Error("DetailedCharacterDataLoader.load() requires preloaded ruleset data — call via withRulesetScope");

    const shared: SharedCharacterData =
      "_shared" in preloaded
        ? (preloaded._shared as SharedCharacterData)
        : await this.loadSharedData(database, preloaded);
    const { ruleset, player, campaign, cowData, rulesetData, race } = shared;
    const resolve: Resolve = (rows) => cowData.resolveRows(rows);
    const abilityLookup = new Map(rulesetData.abilities.map((a) => [a.id, a.name]));
    const levels = resolveLevels(shared.rawCharacterLevels, projectedData, resolve);

    // The join uses the stored item ID. Load the effective item so COW changes
    // refresh its name and other fields, not just its ID.
    const resolvedInventory = shared.inventory.map((inv) => ({
      ...inv,
      itemsInRule: rulesetData.itemsById.get(inv.itemId) ?? inv.itemsInRule,
    }));
    const picks = await fetchPicks(database, levels.realCharacterLevelIds);

    const { languages, klassLevelsRaw, klassLevelSaves, klasses, klassSkills, klassEntityIds } = readCachedRows(
      shared,
      levels.klassLevelIds,
    );

    const { skills, allFeats, klassLevelFeatCountsByAptitudeId, allPowers, klassLevelPowerCountsByAptitudeId } =
      buildPicks(picks, rulesetData, projectedData, levels, resolve);
    const featIds = allFeats.map((feat) => feat.id);
    const powerIds = allPowers.map((power) => power.id);

    const equippedItemIds = resolvedInventory.filter((inv) => inv.equipped).map((inv) => inv.itemsInRule.id);
    const { characterSourcedModifiers, baseModifiers, extraRequirements } = await this.fetchModifiers(
      database,
      rulesetData,
      [race.id, ...equippedItemIds, ...klassEntityIds, ...levels.klassLevelIds, ...featIds, ...powerIds],
    );

    // Round 5b: the modifiers of virtually possessed feats and powers.
    const { virtuallyPossessedFeatIds, virtuallyPossessedPowers } = resolveVirtualPossessions(
      baseModifiers,
      featIds,
      powerIds,
      rulesetData,
    );

    // Each entity's customizations: per-entity lookups resolve via the cache's pre-built Maps.
    const { klassLevels, klassLevelProperties } = toCustomizedKlassLevels(klassLevelsRaw, rulesetData);
    const parts = {
      characterSourcedModifiers,
      race: toCustomizedRace(race, rulesetData),
      inventory: toCustomizedInventory(resolvedInventory, rulesetData),
      klassLevels,
      klassEntityIds,
      feats: toCustomizedFeats(allFeats, virtuallyPossessedFeatIds, rulesetData),
      powers: toCustomizedPowers(allPowers, virtuallyPossessedPowers, rulesetData),
    };
    const { modifiers, requirementGroups } = collectModifiers(parts, rulesetData, extraRequirements);

    return {
      ruleset,
      player,
      campaign,
      ...readRulesetLists(rulesetData),
      ...readRulesetProperties(rulesetData, (id) => cowData.resolve(id)),
      characterAbilityScores: resolve(shared.characterAbilityRecords).map((ca) => buildAbilityScore(ca, abilityLookup)),
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
      ...readKlassProperties(klassEntityIds, rulesetData, abilityLookup),
    };
  }

  async loadSharedData(database: Db = db, preloaded: PreloadedRulesetData): Promise<SharedCharacterData> {
    const { ruleset, cowData, rulesetData } = preloaded;

    // Character's race — read from the composed ruleset cache.
    // racesById auto-resolves stored pre-COW ids (RulesetComposition).
    const race = rulesetData.racesById.get(this.character.raceId);
    if (!race) throw new Error("Race not found");

    // Campaign context + character core data, all in parallel. Ruleset /
    // cowData / rulesetData arrive pre-loaded from `withRulesetScope`.
    const playerCharacter = await PlayerCharacters.findOne(database, {
      characterId: this.character.id,
    });
    const player = playerCharacter ? await Players.findOne(database, { id: playerCharacter.playerId }) : undefined;

    const campaign = player ? await Campaigns.findOne(database, { id: player.campaignId }) : undefined;
    const characterAbilityRecords = await CharacterAbilities.findMany(database, {
      characterId: this.character.id,
    });
    const characterLanguages = await CharacterLanguages.findMany(database, {
      characterId: this.character.id,
    });
    const inventory = await CharacterInventoryRepository.findMany(database, {
      characterId: this.character.id,
    });
    const rawCharacterLevels = await CharacterLevels.findMany(database, {
      characterId: this.character.id,
    });

    return {
      ruleset,
      player,
      campaign,
      cowData,
      rulesetData,
      characterAbilityRecords,
      race,
      characterLanguages,
      inventory,
      rawCharacterLevels,
    };
  }
}
