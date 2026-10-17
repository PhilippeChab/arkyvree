import { CharacterDataLoader, type LoadedCharacter, type ModifierSource } from "@/engine/core/character/index.ts";
import type { AbilityIncrease, CharacterRows } from "@/engine/core/module/index.ts";
import { type RulesetView } from "@/engine/core/view/index.ts";
import { type SkillFieldValues } from "@/engine/rulesets/dnd3.5/entities/skills/fields.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { include } from "@/lib/mixins.ts";
import type {
  Character,
  CharacterLevel,
  Klass,
  KlassLevelSave,
  KlassSkill,
  Language,
  Skill,
} from "@/shared/relations.ts";

import { CustomizesEntities } from "./concerns/CustomizesEntities.ts";
import { LoadsPicks } from "./concerns/LoadsPicks.ts";
import { ReadsRuleset } from "./concerns/ReadsRuleset.ts";
import type { CustomizedClassLevel, CustomizedFeat, CustomizedPower, CustomizedRace } from "./loadedEntities.ts";

/**
 * What a 3.5 character has of its ruleset's entities (`partsOf`): its data past core's, but its own row and the
 * ruleset's properties (`loadOwn`); and its classes' ids, whose modifiers it takes once each (`sourcesOf`).
 */
type LoadedParts = Omit<
  LoadedCharacterData,
  keyof LoadedCharacter | "character" | "levelRules" | "skillFields" | "skillPointAbilityId"
> & {
  klassEntityIds: string[];
};

/**
 * What a 3.5 character is built from, past what core loads (`LoadedCharacter`): its rows, as its ruleset's view
 * composes them, and what they read of the view (its classes' fields, its skills' fields). The ruleset's own lists the
 * build reads off the view itself.
 */
export interface LoadedCharacterData extends LoadedCharacter {
  /** The ability increases the character's levels take. */
  abilityIncreases: AbilityIncrease[];
  /** The character's own row: who it is (`IdentityComponent`). */
  character: Character;
  characterAbilityScores: { abilityId: string; name: string; score: number }[];
  characterLevels: CharacterLevel[];
  /**
   * The feats it holds: its levels' picks and grants as it loads, then those its modifiers grant it as they apply in
   * the build's rounds (`PossessesVirtually`).
   */
  feats: CustomizedFeat[];
  klassBonusSpellAbilityMap: Map<string, string>;
  klassCasterTypeMap: Map<string, "Arcane" | "Divine">;
  klasses: Klass[];
  klassLevelFeatCountsByAptitudeId: Record<string, number>;
  klassLevelPowerCountsByAptitudeId: Record<string, number>;
  klassLevelProperties: Map<string, { bab: number; skills: number }>;
  klassLevels: CustomizedClassLevel[];
  klassLevelSaves: KlassLevelSave[];
  klassSkills: KlassSkill[];
  /** The languages it picked, as its rows store them. */
  languages: Language[];
  /** What its levels give it whatever its classes, by its ruleset's Settings: its general feats, its increases. */
  levelRules: LevelRules;
  /**
   * The powers it knows, each in its pool: its levels' picks and grants as it loads, then those its modifiers make it
   * know as they apply in the build's rounds (`PossessesVirtually`), and those its lists make it know as its
   * spellcasting finishes (`KnownPowers`).
   */
  powers: CustomizedPower[];
  race: CustomizedRace;
  skillFields: Map<string, SkillFieldValues>;
  skillPointAbilityId: string | null;
  skills: SkillWithRank[];
}

/** Resolves stored ids through the override map, when there is one. */
export type Resolve = <T extends Record<string, unknown>>(rows: T[]) => T[];

export type SkillWithRank = Skill & {
  characterLevelId: string;
  klassLevelId: string;
  rank: number;
};

/**
 * The 3.5 loader, on core's (`CharacterDataLoader`): what a character has of its ruleset's entities (its levels, its
 * picks and grants, its classes, race and languages), each with its customizations from the view, the sources of its
 * modifiers in the order they apply, and its own row, ability scores and the ruleset's properties. What its modifiers
 * grant it (a feat, a spell, a language) isn't loaded: a grant gives it as it applies, in the build's rounds behind its
 * requirements (`PossessesVirtually`).
 */
export default class DetailedCharacterDataLoader extends include(
  CharacterDataLoader<LoadedCharacterData, LoadedParts>,
  CustomizesEntities,
  LoadsPicks,
  ReadsRuleset,
) {
  /** The character's data: core's (`loaded`), its parts, its own row, and the ruleset's properties. */
  protected override loadOwn(
    view: RulesetView,
    { klassEntityIds: _klassEntityIds, ...parts }: LoadedParts,
    loaded: LoadedCharacter,
  ): LoadedCharacterData {
    return {
      ...loaded,
      ...parts,
      character: this.character,
      ...this.readRulesetProperties(view, (id) => view.rulesetData.cow.resolve(id)),
    };
  }

  /**
   * The character's ability scores and increases, its levels, its picks and grants, each with its customizations, and
   * its classes' fields.
   */
  protected override partsOf(rows: CharacterRows, view: RulesetView): LoadedParts {
    const { rulesetData } = view;
    // The character's race, from the view: racesById resolves a stored id (RulesetComposition)
    const race = rulesetData.racesById.get(this.character.raceId);
    if (!race) throw new Error("Race not found");

    const resolve: Resolve = (rows) => rulesetData.cow.resolveRows(rows);
    const abilityLookup = new Map(rulesetData.abilities.map((a) => [a.id, a.name]));
    const levels = this.resolveLevels(rows.levels, resolve);
    const { languages, klassLevelsRaw, klassLevelSaves, klasses, klassSkills, klassEntityIds } = this.readCachedRows(
      rows,
      rulesetData,
      levels.klassLevelIds,
    );
    const { skills, allFeats, klassLevelFeatCountsByAptitudeId, allPowers, klassLevelPowerCountsByAptitudeId } =
      this.buildPicks(rows.picks, rulesetData, levels, resolve);

    // Each entity's customizations: per-entity lookups resolve via the cache's pre-built Maps
    const { klassLevels, klassLevelProperties } = this.toCustomizedKlassLevels(klassLevelsRaw, rulesetData);
    const klassProperties = this.readKlassProperties(klassEntityIds, rulesetData, abilityLookup);
    const dcAbilities = { klassBonusSpellAbilityMap: klassProperties.klassBonusSpellAbilityMap, klassLevels };
    return {
      characterAbilityScores: resolve(rows.abilities).map((ca) => this.buildAbilityScore(ca, abilityLookup)),
      abilityIncreases: this.readAbilityIncreases(
        resolve(rows.picks.abilityIncreases),
        levels.characterLevels,
        LevelRules.of(view),
      ),
      race: this.toCustomizedRace(race, rulesetData),
      languages,
      characterLevels: levels.characterLevels,
      klassEntityIds,
      klassLevels,
      klassSkills,
      klassLevelSaves,
      klasses,
      feats: this.toCustomizedFeats(allFeats, rulesetData),
      skills,
      powers: this.toCustomizedPowers(allPowers, rulesetData, dcAbilities),
      klassLevelFeatCountsByAptitudeId,
      klassLevelPowerCountsByAptitudeId,
      klassLevelProperties,
      ...klassProperties,
    };
  }

  /**
   * The sources of the character's modifiers past its own, in the order they apply: its race, its equipped items, its
   * class levels, its classes (once each, for a character with any level of it), its feats and its powers (once each,
   * however many lists know it: its first, a pick before a grant). A feat or a power granted without a pick (a class
   * level's) bypasses its own prerequisites: what grants it is its gate, as for one a modifier grants, whose modifiers
   * join the build as it applies (`PossessesVirtually`).
   */
  protected override sourcesOf(
    { feats, klassEntityIds, klassLevels, powers, race }: LoadedParts,
    items: ModifierSource[],
    { rulesetData }: RulesetView,
  ): ModifierSource[] {
    return [
      race,
      ...items,
      ...klassLevels,
      ...klassEntityIds.map((klassId) => ({
        modifiers: rulesetData.modifiersBySource.get(klassId) ?? [],
        requirements: rulesetData.requirementsByEntity.get(klassId) ?? [],
      })),
      ...feats.map((feat) => (feat.klassLevelFeatId ? { modifiers: feat.modifiers } : feat)),
      ...[...Map.groupBy(powers, (power) => power.id).values()].map(([power]) =>
        power.free ? { modifiers: power.modifiers } : power,
      ),
    ];
  }

  /**
   * The ability increases (`increases`, as the view resolves them) of the character's levels (`characterLevels`, in
   * order) that take one by its ruleset's Settings (`levelRules`): one its Settings since moved off its level counts
   * for nothing, as its level's edit opens it without it (`describeLevel`).
   */
  private readAbilityIncreases(
    increases: CharacterRows["picks"]["abilityIncreases"],
    characterLevels: CharacterLevel[],
    levelRules: LevelRules,
  ) {
    const taking = new Set(
      characterLevels.filter((_, before) => levelRules.isAbilityIncreaseLevel(before)).map(({ id }) => id),
    );
    return increases
      .filter(({ characterLevelId }) => taking.has(characterLevelId))
      .map(({ abilityId, amount }) => ({ abilityId, amount }));
  }
}
