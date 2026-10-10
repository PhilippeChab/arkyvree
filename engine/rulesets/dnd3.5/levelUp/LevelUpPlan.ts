import {
  type AbilityIncrease,
  type CharacterInput,
  CharacterProjection,
  type LevelPicks,
  type LevelRequest,
  type PlannedSoFar,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";

import type { FeatSlots } from "./AptitudeSlotsPlan.ts";
import PicksDistribution, { type PerLevelDistributionData } from "./PicksDistribution.ts";
import PlannedLevelsState, { type PlannedLevels } from "./PlannedLevelsState.ts";

/** A planned level checked: its class level, hit points, ability increases and picks. */
interface PlannedLevel {
  abilityIncreases: AbilityIncrease[];
  hp: number;
  klassLevelId: string;
  picks: LevelPicks;
}

/**
 * The levels a level-up saves, from the character's rows: its pooled picks spread over them, each level checked as the
 * levels before it see it, and the character with them checked unless forced.
 */
export default class LevelUpPlan extends PlannedLevelsState {
  /** What a save distributes its pooled picks over the planned levels by: each level's points, class skills and slots. */
  private buildDistributionData(planned: PlannedLevels): PerLevelDistributionData {
    const { classSkills, perLevelFeatSlots, perLevelPowerSlots, perLevelSkillPoints } = this.computeLevelGains(planned);
    return {
      perLevelSkillPoints,
      perLevelClassSkillIds: classSkills.perLevel,
      perLevelFeatSlots,
      perLevelPowerSlots,
      savedLevelCount: planned.savedLevelCount,
      skillContexts: PicksDistribution.contextsOf(
        planned.character.components.skills.getEnrichedSkills(this.rulesetData.skills, classSkills.merged),
      ),
    };
  }

  /**
   * A save's pooled picks (skill ranks, and feats and powers by pool) spread over its planned levels, each level taking
   * what its points and slots allow, in order.
   */
  private distributePlannedPicks(planned: PlannedLevels, { feats, powers, skills }: LevelPicks) {
    const data = this.buildDistributionData(planned);
    return new PicksDistribution(data).distribute(
      skills,
      feats,
      powers,
      this.buildPowerLevelLookup(Object.values(powers).flat()),
      this.getDeferredAptitudeSources(feats, data.perLevelFeatSlots),
    );
  }

  /**
   * The feat each pool with no slots of its own comes from: a pool a feat's modifier creates
   * (`aptitudes.<slug>….allowed`) goes with the first-pass feat that targets it.
   */
  private getDeferredAptitudeSources(feats: Record<string, string[]>, perLevelFeatSlots: FeatSlots) {
    const hasSlots = (aptId: string) => (perLevelFeatSlots[aptId] ?? []).some((s) => s > 0);
    const deferredAptitudeIds = Object.keys(feats).filter((aptId) => !hasSlots(aptId));
    const sources = new Map<string, string>();
    if (deferredAptitudeIds.length === 0) return sources;

    const deferredAptIdSet = new Set(deferredAptitudeIds);
    const firstPassFeatIds = Object.entries(feats)
      .filter(([aptId]) => hasSlots(aptId))
      .flatMap(([, ids]) => ids);
    for (const featId of firstPassFeatIds) {
      const mods = this.rulesetData.modifiersBySource.get(featId);
      if (!mods) continue;
      for (const mod of mods) {
        const list = AptitudeTargets.parseAllowed(mod.target);
        if (list === undefined) continue;
        const aptId = this.rulesetData.aptitudeIdBySlug.get(list);
        if (aptId && deferredAptIdSet.has(aptId)) sources.set(aptId, mod.sourceId);
      }
    }
    return sources;
  }

  /**
   * The character as the save leaves it: each planned level a fresh level after its saved ones, with its hit points,
   * ability increases and picks, as a level's edit projects it (`LevelEdit`).
   */
  private projectLevelRequests(planned: PlannedLevel[]) {
    const projection = new CharacterProjection(this.character);
    for (const { abilityIncreases, hp, klassLevelId, picks } of planned)
      projection.pick(projection.addLevel(klassLevelId, { abilityIncreases, hp }), this.toPickRows(picks));
    return projection;
  }

  /**
   * The levels a level-up saves (`levels`, with the character's pooled picks spread over them), and what the master's
   * bonded creatures (`bonded`, their rows) become with them. Each level is checked as the levels before it see it,
   * and refused when it's saved already, raises its abilities by other than its rules give it, or picks what it can't;
   * the character with them is refused with what it fails, unless `force`d. Each level's writes are its row's columns
   * (its class level and hit points) and its rows under it (its ability increases and picks).
   */
  planLevels(bonded: CharacterInput[], levels: LevelRequest[], picks: LevelPicks, force: boolean) {
    const { rows } = this.character;
    const klassLevelEntries = this.getPlannedKlassLevels(levels);
    // Every selection is the ruleset's before a character is built with it
    this.checks.checkSelections(picks.skills, picks.feats, picks.powers);
    const distributed = this.distributePlannedPicks(this.buildPlannedLevels(klassLevelEntries), picks);

    // Each level sees the saved ones and those planned before it
    const otherLevels: { klassLevelId: string }[] = [...rows.levels];
    const pickedFeatIds = rows.picks.feats.map((pick) => pick.featId);
    const planned: PlannedLevel[] = [];
    for (const [i, { klass, klassLevel }] of klassLevelEntries.entries()) {
      const { hp, abilityIncreases } = levels[i];
      const levelPicks = distributed[i];
      if (otherLevels.some((other) => other.klassLevelId === klassLevel.id))
        throw new RulesError("invalid", `Level ${i + 1}: This level has already been finalized`);
      this.checks.checkAbilityIncreases(rows.levels.length + i, abilityIncreases, `Level ${i + 1}: `);
      this.checks.checkLevel({ klass, klassLevel, hp, abilityIncreases, ...levelPicks }, otherLevels, pickedFeatIds);
      planned.push({ abilityIncreases, hp, klassLevelId: klassLevel.id, picks: levelPicks });
      otherLevels.push({ klassLevelId: klassLevel.id });
      pickedFeatIds.push(...Object.values(levelPicks.feats).flat());
    }

    const saved = this.build(this.projectLevelRequests(planned));
    if (!force) RulesError.refuseIssues(saved.validate().issues);
    return {
      bonded: this.planBondedOf(saved, bonded),
      levels: planned.map(({ abilityIncreases, hp, klassLevelId, picks: levelPicks }) => ({
        columns: { hp, klassLevelId },
        rows: { abilityIncreases, ...this.toPickRows(levelPicks) },
      })),
    };
  }

  /**
   * The skill points the level-up wizard has spent so far (`planned.skillPoints`), spread over the levels it plans as a
   * save spreads them (within each level's points and max ranks, class skills first): each planned level's skill rows,
   * which the class picker projects. Refused when a planned level isn't one of the view's class levels.
   */
  spreadSkillPoints({ abilityIncreases = [], klassLevelIds = [], skillPoints = {} }: PlannedSoFar) {
    if (Object.keys(skillPoints).length === 0) return [];
    const klassLevelEntries = klassLevelIds.map((klassLevelId, i) => ({
      ...this.getSavedKlassLevel({ klassLevelId }),
      abilityIncreases: abilityIncreases[i] ?? [],
    }));
    const picks = { feats: {}, powers: {}, skills: skillPoints };
    const distributed = this.distributePlannedPicks(this.buildPlannedLevels(klassLevelEntries), picks);
    return distributed.map((levelPicks) => this.toPickRows(levelPicks).skills);
  }
}
