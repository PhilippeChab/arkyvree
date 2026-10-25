import { CharacterDataLoader, type LoadedCharacter, type ModifierSource } from "@/engine/core/character/index.ts";
import type { CharacterRows, StoredAdvancement, StoredPick } from "@/engine/core/module/index.ts";
import { type RulesetView, type ViewLink } from "@/engine/core/view/index.ts";
import CharacterValues from "@/engine/rulesets/dnd3.5/characters/CharacterValues.ts";
import { type SkillFieldValues } from "@/engine/rulesets/dnd3.5/entities/skills/fields.ts";
import type { AbilityIncrease } from "@/engine/rulesets/dnd3.5/levelUp/requests.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Klass, Language, Skill } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { include } from "@/lib/mixins.ts";
import type { Character } from "@/shared/relations.ts";
import type { CasterType } from "@/vocabulary/dnd3.5/classes.ts";

import { CustomizesEntities } from "./concerns/CustomizesEntities.ts";
import { LoadsPicks } from "./concerns/LoadsPicks.ts";
import { ReadsRuleset } from "./concerns/ReadsRuleset.ts";
import type { CustomizedClassLevel, CustomizedFeat, CustomizedRace, CustomizedSpell } from "./loadedEntities.ts";

/**
 * What a 3.5 character has of its ruleset's entities (`partsOf`): its data past core's, but its own row and the
 * ruleset's Settings (`loadOwn`); and its classes' ids, whose modifiers it takes once each (`sourcesOf`).
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
  /** Its levels: its advancements, in the order it took them. */
  characterLevels: StoredAdvancement[];
  classLevelFields: Map<string, { bab: number; skills: number }>;
  /**
   * The feats it holds: its levels' picks and grants as it loads, then those its modifiers grant it as they apply in
   * the build's rounds (`PossessesVirtually`).
   */
  feats: CustomizedFeat[];
  klassBonusSpellAbilityMap: Map<string, string>;
  klassCasterTypeMap: Map<string, CasterType>;
  klasses: Klass[];
  klassLevelFeatCountsByAptitudeId: Record<string, number>;
  klassLevels: CustomizedClassLevel[];
  /** Its class levels' base bonuses to the saves: their `baseBonus` links. */
  klassLevelSaves: readonly ViewLink[];
  klassLevelSpellCountsByAptitudeId: Record<string, number>;
  /** Its classes' class skills: their `classSkill` links. */
  klassSkills: readonly ViewLink[];
  /** The languages it picked, as its rows store them. */
  languages: Language[];
  /** The hit points each of its levels rolled, by its advancement's id. */
  levelHitPoints: ReadonlyMap<string, number>;
  /** What its levels give it whatever its classes, by its ruleset's Settings: its general feats, its increases. */
  levelRules: LevelRules;
  race: CustomizedRace;
  skillFields: Map<string, SkillFieldValues>;
  skillPointAbilityId: string | null;
  skills: SkillWithRank[];
  /**
   * The spells it knows, each in its pool: its levels' picks and grants as it loads, then those its modifiers make it
   * know as they apply in the build's rounds (`PossessesVirtually`), and those its lists make it know as its
   * spellcasting finishes (`KnownSpells`).
   */
  spells: CustomizedSpell[];
}

export type SkillWithRank = Skill & {
  characterLevelId: string;
  klassLevelId: string;
  rank: number;
};

/**
 * The 3.5 loader, on core's (`CharacterDataLoader`): what a character has of its ruleset's entities (its levels, its
 * picks and grants, its classes, race and languages), each with its customizations from the view, the sources of its
 * modifiers in the order they apply, and its own row, ability scores and the ruleset's Settings. What its modifiers
 * grant it (a feat, a spell, a language) isn't loaded: a grant gives it as it applies, in the build's rounds behind its
 * requirements (`PossessesVirtually`).
 */
export default class DetailedCharacterDataLoader extends include(
  CharacterDataLoader<LoadedCharacterData, LoadedParts>,
  CustomizesEntities,
  LoadsPicks,
  ReadsRuleset,
) {
  /** The character's data: core's (`loaded`), its parts, its own row, and the ruleset's Settings. */
  protected override loadOwn(
    view: RulesetView,
    { klassEntityIds: _klassEntityIds, ...parts }: LoadedParts,
    loaded: LoadedCharacter,
  ): LoadedCharacterData {
    return {
      ...loaded,
      ...parts,
      character: this.character,
      ...this.readRulesetValues(view, (id) => view.rulesetData.cow.resolve(id)),
    };
  }

  /**
   * The character's ability scores and increases, its levels, its picks and grants, each with its customizations, and
   * its classes' fields.
   */
  protected override partsOf(rows: CharacterRows, view: RulesetView): LoadedParts {
    const { rulesetData } = view;
    const dnd35 = Dnd35View.of(rulesetData);
    // The character's race, from the view: racesById resolves a stored id (RulesetComposition)
    const race = dnd35.racesById.get(CharacterValues.read(this.character).raceId);
    if (!race) throw new Error("Race not found");

    const abilityLookup = new Map(dnd35.abilities.map((a) => [a.id, a.name]));
    const levels = this.sortLevels(rows.advancements, rows.picks);
    const { languages, klassLevelsRaw, klassLevelSaves, klasses, klassSkills, klassEntityIds } = this.readCachedRows(
      rows,
      rulesetData,
      levels.klassLevelIds,
    );
    const { skills, allFeats, klassLevelFeatCountsByAptitudeId, allSpells, klassLevelSpellCountsByAptitudeId } =
      this.buildPicks(rows.picks, rulesetData, levels);

    // Each entity's customizations: per-entity lookups resolve via the cache's pre-built Maps
    const { klassLevels, classLevelFields } = this.toCustomizedKlassLevels(klassLevelsRaw, rulesetData);
    const classFields = this.readClassFields(klassEntityIds, rulesetData, abilityLookup);
    const dcAbilities = { klassBonusSpellAbilityMap: classFields.klassBonusSpellAbilityMap, klassLevels };
    return {
      characterAbilityScores: rows.links.score.map((link) => this.buildAbilityScore(link, abilityLookup)),
      abilityIncreases: this.readAbilityIncreases(rows.picks.abilities, levels.characterLevels, LevelRules.of(view)),
      race: this.toCustomizedRace(race, rulesetData),
      languages,
      characterLevels: levels.characterLevels,
      levelHitPoints: levels.hitPoints,
      klassEntityIds,
      klassLevels,
      klassSkills,
      klassLevelSaves,
      klasses,
      feats: this.toCustomizedFeats(allFeats, rulesetData),
      skills,
      spells: this.toCustomizedSpells(allSpells, rulesetData, dcAbilities),
      klassLevelFeatCountsByAptitudeId,
      klassLevelSpellCountsByAptitudeId,
      classLevelFields,
      ...classFields,
    };
  }

  /**
   * The sources of the character's modifiers past its own, in the order they apply: its race, its equipped items, its
   * class levels, its classes (once each, for a character with any level of it), its feats and its spells (once each,
   * however many lists know it: its first, a pick before a grant). A feat or a spell granted without a pick (a class
   * level's) bypasses its own prerequisites: what grants it is its gate, as for one a modifier grants, whose modifiers
   * join the build as it applies (`PossessesVirtually`).
   */
  protected override sourcesOf(
    { feats, klassEntityIds, klassLevels, spells, race }: LoadedParts,
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
      ...[...Map.groupBy(spells, (spell) => spell.id).values()].map(([spell]) =>
        spell.free ? { modifiers: spell.modifiers } : spell,
      ),
    ];
  }

  /**
   * The ability increases (`increases`, its `abilities` picks, as the view resolves them) of the character's levels
   * (`characterLevels`, in order) that take one by its ruleset's Settings (`levelRules`): one its Settings since moved
   * off its level counts for nothing, as its level's edit opens it without it (`describeLevel`).
   */
  private readAbilityIncreases(
    increases: StoredPick[],
    characterLevels: StoredAdvancement[],
    levelRules: LevelRules,
  ): AbilityIncrease[] {
    const taking = new Set(
      characterLevels.filter((_, before) => levelRules.isAbilityIncreaseLevel(before)).map(({ id }) => id),
    );
    return increases
      .filter(({ advancementId }) => taking.has(advancementId))
      .map(({ amount, entityId }) => ({ abilityId: entityId!, amount: amount! }));
  }
}
