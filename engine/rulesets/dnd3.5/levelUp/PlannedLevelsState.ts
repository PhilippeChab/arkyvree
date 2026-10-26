import { z } from "zod";

import { OwnerValues } from "@/engine/core/fields/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { ViewLink } from "@/engine/core/view/index.ts";
import { CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import SkillRules from "@/engine/rulesets/dnd3.5/rules/SkillRules.ts";
import { include } from "@/lib/mixins.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd3.5/bondedKinds.ts";

import CharacterProjection from "./CharacterProjection.ts";
import { PlansAptitudeSlots } from "./concerns/PlansAptitudeSlots.ts";
import type { PlannedClassLevel } from "./LevelUpBase.ts";
import LevelUpState, { type PoolPicks } from "./LevelUpState.ts";
import PicksDistribution, { type FeatSlots, type PerLevelDistributionData } from "./PicksDistribution.ts";
import type { LevelPicks, LevelRequest } from "./requests.ts";

/**
 * A level-up's planned levels, built: the character with them (`character`, built with their projection), the
 * character as saved, without them (`saved`), what their class levels grant, and how many levels it has before them.
 */
export interface PlannedLevels {
  character: DetailedCharacter;
  classLevelEntries: PlannedClassLevel[];
  /** Each planned level's granted feats the view shows: its class level's `grants` links to feats */
  grantedFeatRecords: ViewLink[][];
  saved: DetailedCharacter;
  savedLevelCount: number;
}

/** What the planned levels give: the pools the character picks in, and each level's skill points, class skills and slots. */
export type LevelGains = ReturnType<PlannedLevelsState["computeLevelGains"]>;

/** A level-up's planned level, within the rules' bounds: no class past its last level. */
const PLANNED_LEVEL = z.object({ level: z.number().max(RULESET_LIMITS.classLevel) });

/**
 * The levels a character plans in a level-up, from its rows: each checked to be the ruleset's, the character built with
 * them, and what they give, the same for the wizard's preview (`LevelUpPreview`) and the save (`LevelUpPlan`): the
 * pools the character picks in, and each level's skill points, class skills and pool slots (`PlansAptitudeSlots`).
 */
export default abstract class PlannedLevelsState extends include(LevelUpState, PlansAptitudeSlots) {
  /** What a save distributes its pooled picks over the planned levels by: each level's points, class skills and slots. */
  private buildDistributionData(planned: PlannedLevels, gains: LevelGains): PerLevelDistributionData {
    const { classSkills, perLevelFeatSlots, perLevelSpellSlots, perLevelSkillPoints } = gains;
    return {
      perLevelSkillPoints,
      perLevelClassSkillIds: classSkills.perLevel,
      perLevelFeatSlots,
      perLevelSpellSlots,
      savedLevelCount: planned.savedLevelCount,
      skillContexts: PicksDistribution.contextsOf(
        planned.character.components.skills.getEnrichedSkills(this.dnd35.skills, classSkills.merged),
      ),
    };
  }

  /**
   * Each planned level's points per level before the minimum, in the batch's order: its class's and the skill point
   * ability's modifier.
   */
  private computeSkillPointBasesPerLevel(character: DetailedCharacter, classLevelIds: string[]): number[] {
    const { skills } = character.components;
    return classLevelIds.map((classLevelId) =>
      skills.getLevelPointsPerLevel(
        CLASS_LEVEL_FIELDS.read(this.rulesetData.find("class-levels", classLevelId) ?? OwnerValues.NONE).skills,
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
        const aptId = list === undefined ? undefined : this.dnd35.aptitudeIdBySlug.get(list);
        if (aptId && Object.hasOwn(feats, aptId)) sources.set(aptId, mod.sourceId);
      }
    }
    return sources;
  }

  /**
   * The planned levels (`classLevelEntries`), built from the character's rows: the character with them (each with its
   * ability increase), and as saved.
   */
  protected buildPlannedLevels(classLevelEntries: PlannedClassLevel[]): PlannedLevels {
    const projection = new CharacterProjection(this.character);
    for (const { abilityIncreases, classLevel } of classLevelEntries)
      projection.addLevel(classLevel.id, { abilityIncreases, hp: LevelRules.UNROLLED_LEVEL_HP });
    return {
      grantedFeatRecords: classLevelEntries.map(({ classLevel }) =>
        this.dnd35.grantedFeatsOf(classLevel.id).filter((grant) => this.dnd35.featsById.has(grant.toId)),
      ),
      character: this.build(projection),
      savedLevelCount: this.character.rows.advancements.length,
      classLevelEntries,
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
    for (const [i, { abilityIncreases, classLevel }] of planned.classLevelEntries.entries()) {
      const level = projection.addLevel(classLevel.id, { abilityIncreases, hp: LevelRules.UNROLLED_LEVEL_HP });
      projection.pick(level, this.toPickPlans(distributed[i]));
    }
    return this.build(projection);
  }

  /**
   * What the planned levels give, the same for the preview and the save: the pools the character picks in, and each
   * level's skill points, class skills and pool slots.
   */
  protected computeLevelGains(planned: PlannedLevels) {
    const { grantedFeatRecords, character, savedLevelCount, classLevelEntries, saved } = planned;
    const classLevelIds = classLevelEntries.map(({ classLevel }) => classLevel.id);
    const pools = character.components.aptitudes.getLevelUpPools(this.dnd35);
    const slots = this.planAptitudeSlots(
      classLevelIds,
      grantedFeatRecords,
      Object.keys(pools.featPools),
      Object.keys(pools.spellPools),
      savedLevelCount,
      saved.components.aptitudes.getAptitudes(),
    );
    return {
      ...slots,
      classSkills: this.getPlannedClassSkills(classLevelEntries.map(({ klass }) => klass.id)),
      classLevelIds,
      perLevelSkillPoints: this.computeSkillPointsPerLevel(character, classLevelIds, savedLevelCount),
      pools,
    };
  }

  /** Each planned level's skill points, in the batch's order: the first counts four times over on a new character. */
  protected computeSkillPointsPerLevel(
    character: DetailedCharacter,
    classLevelIds: string[],
    savedLevelCount: number,
  ): number[] {
    const { bonusPerLevel } = character.components.skills.getSkillPointBases();
    return this.computeSkillPointBasesPerLevel(character, classLevelIds).map((points, i) =>
      SkillRules.levelPoints(points, bonusPerLevel, savedLevelCount === 0 && i === 0),
    );
  }

  /**
   * A save's pooled picks (skill ranks, and feats and spells by pool) spread over its planned levels, each level taking
   * what its points and slots allow, in order, and what's past a pool's slots on the level of the feat that gives it
   * room, or the last (`PicksDistribution`). `gains`: what the levels give, when the caller has them.
   */
  protected distributePlannedPicks(planned: PlannedLevels, picks: LevelPicks, gains = this.computeLevelGains(planned)) {
    const data = this.buildDistributionData(planned, gains);
    return new PicksDistribution(data).distribute(
      picks,
      this.buildSpellLevelLookup(Object.values(picks.spells).flat()),
      this.getAptitudeSources(picks.feats, data.perLevelFeatSlots),
    );
  }

  /**
   * The class skills of planned levels, from their classes (`classIds`, one per level): each level's, in the ruleset's
   * skill order (what a rank costs at that level), and every planned class's together (the rank cap).
   */
  protected getPlannedClassSkills(classIds: string[]) {
    const { skills } = this.dnd35;
    const recordsOf = (classId: string) => this.dnd35.classSkillsOf(classId);
    const perLevel = classIds.map((classId) => {
      const ids = this.getClassSkillIds(recordsOf(classId));
      return skills.filter((skill) => ids.has(skill.id)).map((skill) => skill.id);
    });
    const merged = this.getClassSkillIds([...new Set(classIds)].flatMap(recordsOf));
    return { perLevel, merged };
  }

  /**
   * Each planned level's class and class level, from the composed ruleset: a class the view has is of the character's
   * ruleset or its source chain. Refused past the rules' bounds (a class's last level, and a character's, counting the
   * levels it has), and when a class isn't the view's or a player character's, or hasn't that level.
   */
  getPlannedClassLevels(levels: Omit<LevelRequest, "hp">[]): PlannedClassLevel[] {
    // No character past its last level: the planned levels come after those it has
    const levelsLeft = LevelRules.countLevelsLeft(this.character.rows.advancements.length);
    const message = `A character can't go past level ${RULESET_LIMITS.characterLevel}: ${levelsLeft} level(s) left`;
    RulesError.parse(z.array(PLANNED_LEVEL).max(levelsLeft, message), levels, ["levels"]);
    return levels.map(({ classId, level, abilityIncreases }, i) => {
      const klass = this.dnd35.classesById.get(classId);
      if (!klass) throw new RulesError("invalid", `Level ${i + 1}: Class does not belong to the character's ruleset`);

      if (klass.partition !== PLAYER_CHARACTER_KIND)
        throw new RulesError("invalid", `Level ${i + 1}: Class is not valid for a player character`);

      const classLevel = this.dnd35.classLevelByClassAndLevel.get(`${classId}:${level}`);
      if (!classLevel) throw new RulesError("not-found", `Level ${i + 1}: Class level not found`);

      return { klass, classLevel, abilityIncreases };
    });
  }
}
