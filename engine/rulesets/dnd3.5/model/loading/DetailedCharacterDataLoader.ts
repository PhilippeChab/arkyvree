import { type CharacterRows } from "@/engine/core/module/index.ts";
import { type RulesetData, type RulesetView } from "@/engine/core/view/index.ts";
import { type SkillFieldValues } from "@/engine/rulesets/dnd3.5/entities/skills/fields.ts";
import type { ProjectedCharacterData } from "@/engine/rulesets/dnd3.5/model/projection.ts";
import type {
  Aptitude,
  Campaign,
  Character,
  CharacterLevel,
  Feat,
  Klass,
  KlassLevelSave,
  KlassSkill,
  Language,
  Modifier,
  Player,
  PowerWithAptitudes,
  Property,
  Requirement,
  Ruleset,
  RulesetAbility,
  RulesetSave,
  Skill,
} from "@/shared/relations.ts";

import CustomizedEntities, {
  type CustomizedClassLevel,
  type CustomizedFeat,
  type CustomizedPower,
  type CustomizedRace,
  type InventoryEntry,
} from "./CustomizedEntities.ts";
import Picks from "./Picks.ts";
import Possessions from "./Possessions.ts";
import RulesetReadings from "./RulesetReadings.ts";

/** What a character is built from: its rows and its ruleset's view's, as the loader assembles them. */
export interface LoadedCharacterData {
  campaign: Campaign | undefined;
  characterAbilityScores: { abilityId: string; name: string; score: number }[];
  characterLevels: CharacterLevel[];
  /** The spell lists a feat brings (a domain's, a specialist's school): their spells come with it, never learned. */
  featListIds: Set<string>;
  feats: CustomizedFeat[];
  inventory: InventoryEntry[];
  klassBonusSpellAbilityMap: Map<string, string>;
  klassCasterTypeMap: Map<string, "Arcane" | "Divine">;
  klasses: Klass[];
  klassLevelFeatCountsByAptitudeId: Record<string, number>;
  klassLevelPowerCountsByAptitudeId: Record<string, number>;
  klassLevelProperties: Map<string, { bab: number; skills: number }>;
  klassLevels: CustomizedClassLevel[];
  klassLevelSaves: KlassLevelSave[];
  klassSkills: KlassSkill[];
  languages: Language[];
  leveledAptitudeIds: Set<string>;
  modifiers: Modifier[];
  player: Player | undefined;
  powers: CustomizedPower[];
  race: CustomizedRace;
  requirementGroups: Requirement[][];
  ruleset: Ruleset | undefined;
  rulesetAbilities: RulesetAbility[];
  rulesetAptitudes: Aptitude[];
  rulesetFeatProperties: Property[];
  rulesetFeats: Feat[];
  rulesetKlasses: Klass[];
  rulesetPowerProperties: Property[];
  rulesetPowers: PowerWithAptitudes[];
  rulesetSaves: RulesetSave[];
  rulesetSkills: Skill[];
  skillFields: Map<string, SkillFieldValues>;
  skillPointAbilityId: string | null;
  skills: SkillWithRank[];
  validRulesetIds: Set<string>;
}

/** Resolves stored ids through the override map, when there is one. */
export type Resolve = <T extends Record<string, unknown>>(rows: T[]) => T[];

export type SkillWithRank = Skill & {
  characterLevelId: string;
  klassLevelId: string;
  rank: number;
};

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
  load(rows: CharacterRows, view: RulesetView, projectedData?: ProjectedCharacterData): LoadedCharacterData {
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
    const { klassLevels, klassLevelProperties } = CustomizedEntities.toCustomizedKlassLevels(
      klassLevelsRaw,
      rulesetData,
    );
    const parts = {
      characterSourcedModifiers,
      race: CustomizedEntities.toCustomizedRace(race, rulesetData),
      inventory: CustomizedEntities.toCustomizedInventory(resolvedInventory, rulesetData),
      klassLevels,
      klassEntityIds,
      feats: CustomizedEntities.toCustomizedFeats(allFeats, virtuallyPossessedFeatIds, rulesetData),
      powers: CustomizedEntities.toCustomizedPowers(allPowers, virtuallyPossessedPowers, rulesetData),
    };
    const { modifiers, requirementGroups } = CustomizedEntities.collectModifiers(parts, rulesetData, extraRequirements);

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
