import { z } from "zod";

import type { FeatSlots, GrantedFeatRecords, PlannedClassLevel } from "@/engine/core/levelUp/index.ts";
import { CharacterProjection, type LevelPicks, type LevelRequest } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import SkillRules from "@/engine/rulesets/dnd3.5/rules/SkillRules.ts";
import { include } from "@/lib/mixins.ts";

import { PlansAptitudeSlots } from "./concerns/PlansAptitudeSlots.ts";
import Dnd35PicksDistribution, { type PerLevelDistributionData } from "./Dnd35PicksDistribution.ts";
import LevelUpState, { type PoolPicks } from "./LevelUpState.ts";

/** What the planned levels give: the pools the character picks in, and each level's skill points, class skills and slots. */
export type LevelGains = ReturnType<PlannedLevelsState["computeLevelGains"]>;

/**
 * A level-up's planned levels, built: the character with them (`character`, built with their projection), the
 * character as saved, without them (`saved`), what their class levels grant, and how many levels it has before them.
 */
export interface PlannedLevels {
  character: DetailedCharacter;
  grantedFeatRecords: GrantedFeatRecords[];
  klassLevelEntries: PlannedClassLevel[];
  saved: DetailedCharacter;
  savedLevelCount: number;
}

/** A level-up's planned levels, within the rules' bounds: no class past its last level, no character past its own. */
const PLANNED_LEVELS = z
  .array(z.object({ level: z.number().max(RULESET_LIMITS.classLevel) }))
  .max(RULESET_LIMITS.characterLevel);

/**
 * The levels a character plans in a level-up, from its rows: each checked to be the ruleset's, the character built with
 * them, and what they give, the same for the wizard's preview (`LevelUpPreview`) and the save (`LevelUpPlan`): the
 * pools the character picks in, and each level's skill points, class skills and pool slots (`PlansAptitudeSlots`).
 */
export default abstract class PlannedLevelsState extends include(LevelUpState, PlansAptitudeSlots) {
  /** What a save distributes its pooled picks over the planned levels by: each level's points, class skills and slots. */
  private buildDistributionData(planned: PlannedLevels, gains: LevelGains): PerLevelDistributionData {
    const { classSkills, perLevelFeatSlots, perLevelPowerSlots, perLevelSkillPoints } = gains;
    return {
      perLevelSkillPoints,
      perLevelClassSkillIds: classSkills.perLevel,
      perLevelFeatSlots,
      perLevelPowerSlots,
      savedLevelCount: planned.savedLevelCount,
      skillContexts: Dnd35PicksDistribution.contextsOf(
        planned.character.components.skills.getEnrichedSkills(this.rulesetData.skills, classSkills.merged),
      ),
    };
  }

  /**
   * Each planned level's points per level before the minimum, in the batch's order: its class's and the skill point
   * ability's modifier.
   */
  private computeSkillPointBasesPerLevel(character: DetailedCharacter, klassLevelIds: string[]): number[] {
    const { skills } = character.components;
    return klassLevelIds.map((klassLevelId) =>
      skills.getLevelPointsPerLevel(
        CLASS_LEVEL_FIELDS.read(this.rulesetData.propertiesByEntity.get(klassLevelId) ?? []).skills,
      ),
    );
  }

  /**
   * The feat that gives each pool room past its slots, a pool a feat's modifier creates (`aptitudes.<slug>….allowed`)
   * too: the first-pass feat (one picked in a pool with slots) that targets it.
   */
  private getAptitudeSources(feats: Record<string, string[]>, perLevelFeatSlots: FeatSlots) {
    const hasSlots = (aptId: string) => (perLevelFeatSlots[aptId] ?? []).some((s) => s > 0);
    const sources = new Map<string, string>();
    const firstPassFeatIds = Object.entries(feats)
      .filter(([aptId]) => hasSlots(aptId))
      .flatMap(([, ids]) => ids);
    for (const featId of firstPassFeatIds) {
      for (const mod of this.rulesetData.modifiersBySource.get(featId) ?? []) {
        const list = AptitudeTargets.parseAllowed(mod.target);
        const aptId = list === undefined ? undefined : this.rulesetData.aptitudeIdBySlug.get(list);
        if (aptId && Object.hasOwn(feats, aptId)) sources.set(aptId, mod.sourceId);
      }
    }
    return sources;
  }

  /**
   * The planned levels (`klassLevelEntries`), built from the character's rows: the character with them (each with its
   * ability increase), and as saved.
   */
  protected buildPlannedLevels(klassLevelEntries: PlannedClassLevel[]): PlannedLevels {
    const projection = new CharacterProjection(this.character);
    for (const { abilityIncreases, klassLevel } of klassLevelEntries)
      projection.addLevel(klassLevel.id, { abilityIncreases, hp: LevelRules.UNROLLED_LEVEL_HP });
    return {
      grantedFeatRecords: klassLevelEntries.map(
        ({ klassLevel }) => this.rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [],
      ),
      character: this.build(projection),
      savedLevelCount: this.character.rows.levels.length,
      klassLevelEntries,
      saved: this.build(),
    };
  }

  /**
   * The character with the planned levels (`planned`) and the picks spread over them as a save spreads them (`gains`:
   * what the levels give), which the preview fits the wizard's picks with.
   */
  protected buildWithPicks(planned: PlannedLevels, picks: PoolPicks, gains: LevelGains) {
    const distributed = this.distributePlannedPicks(planned, { ...picks, skills: {} }, gains);
    const projection = new CharacterProjection(this.character);
    for (const [i, { abilityIncreases, klassLevel }] of planned.klassLevelEntries.entries()) {
      const level = projection.addLevel(klassLevel.id, { abilityIncreases, hp: LevelRules.UNROLLED_LEVEL_HP });
      projection.pick(level, this.toPickRows(distributed[i]));
    }
    return this.build(projection);
  }

  /**
   * What the planned levels give, the same for the preview and the save: the pools the character picks in, and each
   * level's skill points, class skills and pool slots.
   */
  protected computeLevelGains(planned: PlannedLevels) {
    const { grantedFeatRecords, character, savedLevelCount, klassLevelEntries, saved } = planned;
    const klassLevelIds = klassLevelEntries.map(({ klassLevel }) => klassLevel.id);
    const pools = character.components.aptitudes.getLevelUpPools(this.rulesetData);
    const slots = this.planAptitudeSlots(
      klassLevelIds,
      grantedFeatRecords,
      Object.keys(pools.featPools),
      Object.keys(pools.powerPools),
      savedLevelCount,
      saved.components.aptitudes.getAptitudes(),
    );
    return {
      ...slots,
      classSkills: this.getPlannedClassSkills(klassLevelEntries.map(({ klass }) => klass.id)),
      klassLevelIds,
      perLevelSkillPoints: this.computeSkillPointsPerLevel(character, klassLevelIds, savedLevelCount),
      pools,
    };
  }

  /** Each planned level's skill points, in the batch's order: the first counts four times over on a new character. */
  protected computeSkillPointsPerLevel(
    character: DetailedCharacter,
    klassLevelIds: string[],
    savedLevelCount: number,
  ): number[] {
    const { bonusPerLevel } = character.components.skills.getSkillPointBases();
    return this.computeSkillPointBasesPerLevel(character, klassLevelIds).map((points, i) =>
      SkillRules.levelPoints(points, bonusPerLevel, savedLevelCount === 0 && i === 0),
    );
  }

  /**
   * A save's pooled picks (skill ranks, and feats and powers by pool) spread over its planned levels, each level taking
   * what its points and slots allow, in order, and what's past a pool's slots on the level of the feat that gives it
   * room, or the last (`Dnd35PicksDistribution`). `gains`: what the levels give, when the caller has them.
   */
  protected distributePlannedPicks(planned: PlannedLevels, picks: LevelPicks, gains = this.computeLevelGains(planned)) {
    const data = this.buildDistributionData(planned, gains);
    return new Dnd35PicksDistribution(data).distribute(
      picks,
      this.buildPowerLevelLookup(Object.values(picks.powers).flat()),
      this.getAptitudeSources(picks.feats, data.perLevelFeatSlots),
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
   * Each planned level's class and class level, from the composed ruleset: a class the view has is of the character's
   * ruleset or its source chain. Refused past the rules' bounds (a class's last level, a character's), and when a class
   * isn't the view's or a player character's, or hasn't that level.
   */
  getPlannedKlassLevels(levels: Omit<LevelRequest, "hp">[]): PlannedClassLevel[] {
    RulesError.parse(PLANNED_LEVELS, levels, ["levels"]);
    return levels.map(({ klassId, level, abilityIncreases }, i) => {
      const klass = this.rulesetData.klassesById.get(klassId);
      if (!klass) throw new RulesError("invalid", `Level ${i + 1}: Class does not belong to the character's ruleset`);

      if (klass.kind !== "pc")
        throw new RulesError("invalid", `Level ${i + 1}: Class is not valid for a player character`);

      const klassLevel = this.rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
      if (!klassLevel) throw new RulesError("not-found", `Level ${i + 1}: Class level not found`);

      return { klass, klassLevel, abilityIncreases };
    });
  }
}
