import { type CharacterInput, CharacterProjection } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import CharacterBuilder from "@/engine/rulesets/dnd3.5/model/CharacterBuilder.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import SkillRules from "@/engine/rulesets/dnd3.5/rules/SkillRules.ts";
import type { Klass, KlassLevel } from "@/shared/relations.ts";

import AptitudeSlotsPlan from "./AptitudeSlotsPlan.ts";
import type { GrantedFeatRecords } from "./concerns/ChecksSelections.ts";
import LevelUpState from "./LevelUpState.ts";

/** A planned level's class and class level, and its ability increase. */
export interface PlannedClassLevel {
  abilityId: string | null;
  klass: Klass;
  klassLevel: KlassLevel;
}

/**
 * A level-up's planned levels, built: the character with them (`character`, built with their projection), the
 * character as saved, without them (`saved`), what their class levels grant, and how many levels it has before them.
 */
export interface PlannedLevels {
  autoGrantedRecords: GrantedFeatRecords[];
  character: DetailedCharacter;
  existingLevelCount: number;
  klassLevelEntries: PlannedClassLevel[];
  saved: DetailedCharacter;
}

/**
 * The levels a character plans in a level-up, from its rows: each checked to be the ruleset's, the character built with
 * them, and what they give, the same for the wizard's preview (`LevelUpPreview`) and the save (`LevelUpPlan`): the
 * pools the character picks in, and each level's skill points, class skills and pool slots.
 */
export default abstract class PlannedLevelsState extends LevelUpState {
  constructor(
    view: RulesetView,
    protected readonly character: CharacterInput,
  ) {
    super(view);
  }

  /**
   * The planned levels (`klassLevelEntries`), built from the character's rows: the character with them (each with its
   * ability increase), and as saved.
   */
  protected buildPlannedLevels(klassLevelEntries: PlannedClassLevel[]): PlannedLevels {
    const projection = new CharacterProjection(this.character);
    for (const { abilityId, klassLevel } of klassLevelEntries)
      projection.addLevel(klassLevel.id, { abilityId, hp: LevelRules.UNROLLED_LEVEL_HP });
    return {
      autoGrantedRecords: klassLevelEntries.map(
        ({ klassLevel }) => this.rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [],
      ),
      character: this.build(projection),
      existingLevelCount: this.character.rows.levels.length,
      klassLevelEntries,
      saved: CharacterBuilder.build(this.view, this.character),
    };
  }

  /**
   * What the planned levels give, the same for the preview and the save: the pools the character picks in, and each
   * level's skill points, class skills and pool slots.
   */
  protected computeLevelUpPlan(planned: PlannedLevels) {
    const { autoGrantedRecords, character, existingLevelCount, klassLevelEntries, saved } = planned;
    const klassLevelIds = klassLevelEntries.map(({ klassLevel }) => klassLevel.id);
    const pools = character.components.aptitudes.getLevelUpPools(this.rulesetData);
    const slots = new AptitudeSlotsPlan(this.rulesetData).compute(
      klassLevelIds,
      autoGrantedRecords,
      Object.keys(pools.featPools),
      Object.keys(pools.powerPools),
      existingLevelCount,
      saved.components.aptitudes.getAptitudes(),
    );
    return {
      ...slots,
      classSkills: this.getPlannedClassSkills(klassLevelEntries.map(({ klass }) => klass.id)),
      klassLevelIds,
      perLevelSkillPoints: this.computeSkillPointsPerLevel(character, klassLevelIds, existingLevelCount),
      pools,
    };
  }

  /**
   * Each planned level's points per level before the minimum, in the batch's order: its class's and the skill point
   * ability's modifier.
   */
  protected computeSkillPointBasesPerLevel(character: DetailedCharacter, klassLevelIds: string[]): number[] {
    const { skills } = character.components;
    return klassLevelIds.map((klassLevelId) =>
      skills.getLevelPointsPerLevel(
        CLASS_LEVEL_FIELDS.read(this.rulesetData.propertiesByEntity.get(klassLevelId) ?? []).skills,
      ),
    );
  }

  /** Each planned level's skill points, in the batch's order: the first counts four times over on a new character. */
  protected computeSkillPointsPerLevel(
    character: DetailedCharacter,
    klassLevelIds: string[],
    existingLevelCount: number,
  ): number[] {
    const { bonusPerLevel } = character.components.skills.getSkillPointBases();
    return this.computeSkillPointBasesPerLevel(character, klassLevelIds).map((points, i) =>
      SkillRules.levelPoints(points, bonusPerLevel, existingLevelCount === 0 && i === 0),
    );
  }

  /**
   * The class skills of planned levels, from their classes (`klassIds`, one per level): each level's, in the ruleset's
   * skill order (what a rank costs at that level), and every planned class's together (the rank cap).
   */
  protected getPlannedClassSkills(klassIds: string[]) {
    const { skills } = this.rulesetData;
    const recordsOf = (klassId: string) => this.rulesetData.klassSkillsWithSkillsByKlass.get(klassId) ?? [];
    const perLevel = klassIds.map((klassId) => {
      const ids = this.getClassSkillIds(recordsOf(klassId));
      return skills.filter((skill) => ids.has(skill.id)).map((skill) => skill.id);
    });
    const merged = this.getClassSkillIds([...new Set(klassIds)].flatMap(recordsOf));
    return { perLevel, merged };
  }

  /**
   * Each planned level's class and class level, from the composed ruleset: a cache hit is proof of lineage. Throws when a
   * class isn't the ruleset's (nor from `rulesetIds`, when given) or a player character's, or hasn't that level.
   */
  protected getPlannedKlassLevels(
    levels: { abilityId: string | null; klassId: string; level: number }[],
    rulesetIds?: Set<string>,
  ): PlannedClassLevel[] {
    return levels.map(({ klassId, level, abilityId }, i) => {
      const klass = this.rulesetData.klassesById.get(klassId);
      if (!klass || (rulesetIds && !rulesetIds.has(klass.rulesetId)))
        throw new RulesError("invalid", `Level ${i + 1}: Class does not belong to the character's ruleset`);

      if (klass.kind !== "pc")
        throw new RulesError("invalid", `Level ${i + 1}: Class is not valid for a player character`);

      const klassLevel = this.rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
      if (!klassLevel) throw new RulesError("not-found", `Level ${i + 1}: Class level not found`);

      return { klass, klassLevel, abilityId };
    });
  }
}
