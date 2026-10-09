import { type CharacterInput, CharacterProjection } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import CharacterBuilder from "@/engine/rulesets/dnd3.5/model/CharacterBuilder.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { include } from "@/lib/mixins.ts";
import { computeLevelSkillPoints } from "@/shared/dnd3.5/skills.ts";
import type { Klass, KlassLevel } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import AptitudeSlotsPlan, { type FeatSlots } from "./AptitudeSlotsPlan.ts";
import BondedPlans from "./BondedPlans.ts";
import { ChecksSelections, type GrantedFeatRecords } from "./concerns/ChecksSelections.ts";
import LevelUpState, { type LevelPicks } from "./LevelUpState.ts";
import PicksDistribution, { type PerLevelDistributionData } from "./PicksDistribution.ts";

/** A planned level's class and class level, and its ability increase. */
interface PlannedClassLevel {
  abilityId: string | null;
  klass: Klass;
  klassLevel: KlassLevel;
}

/** A planned level checked: its class level, hit points, ability and picks. */
interface PlannedLevel {
  abilityId: string | null;
  hp: number;
  klassLevelId: string;
  picks: LevelPicks;
}

/**
 * A level-up's planned levels, built: the character with them (`character`, built with their projection), the
 * character as saved, without them (`saved`), what their class levels grant, and how many levels it has before them.
 */
interface PlannedLevels {
  autoGrantedRecords: GrantedFeatRecords[];
  character: DetailedCharacter;
  existingLevelCount: number;
  klassLevelEntries: PlannedClassLevel[];
  saved: DetailedCharacter;
}

/** A level a level-up saves, as the wizard sends it: its class's level, hit points and ability increase. */
interface SavedLevel {
  abilityId: string | null;
  hp: number;
  klassId: string;
  level: number;
}

/**
 * The levels a character plans in a level-up, from its rows: the wizard's preview of them, and the levels a save
 * writes, its pooled picks spread over them and each checked.
 */
export default class LevelUpPlan extends include(LevelUpState, ChecksSelections) {
  constructor(
    view: RulesetView,
    private readonly character: CharacterInput,
  ) {
    super(view);
  }

  /** What a save distributes its pooled picks over the planned levels by: each level's points, class skills and slots. */
  private buildDistributionData(planned: PlannedLevels): PerLevelDistributionData {
    const { classSkills, perLevelFeatSlots, perLevelPowerSlots, perLevelSkillPoints } =
      this.computeLevelUpPlan(planned);
    return {
      perLevelSkillPoints,
      perLevelClassSkillIds: classSkills.perLevel,
      perLevelFeatSlots,
      perLevelPowerSlots,
      baseCharacterLevel: planned.existingLevelCount,
      skillContexts: this.buildSkillContexts(planned.character, classSkills.merged),
    };
  }

  /**
   * The level-up wizard's preview of the planned levels: its skills, feats, powers and attributes steps, each level's
   * class, hit die and skill points, and what it recomputes the points and auto-assigns the picks by. The skills step's
   * points before the minimum are the planned levels' in the batch's order, and every level's in the budget's.
   */
  private buildLevelUpPreview(planned: PlannedLevels) {
    const { autoGrantedRecords, character, existingLevelCount, klassLevelEntries } = planned;
    const { classSkills, klassLevelIds, perLevelFeatSlots, perLevelPowerSlots, perLevelSkillPoints, pools } =
      this.computeLevelUpPlan(planned);
    const { skills } = character.components;
    return {
      skills: {
        skillPointsToSpend: Math.max(1, skills.getSkillBudget().available),
        totalCharacterLevel: existingLevelCount + klassLevelEntries.length,
        skills: skills.getEnrichedSkills(this.rulesetData.skills, classSkills.merged),
        ...skills.getSkillPointBases(),
      },
      feats: {
        featsToSelect: pools.featsToSelect,
        autoGrantedFeats: autoGrantedRecords.flat().map((rec) => rec.featsInRule),
        aptitudePools: pools.featPools,
      },
      powers: {
        powersToSelect: pools.powersToSelect,
        autoGrantedPowers: this.getAutoGrantedPowers(klassLevelIds),
        aptitudePools: pools.powerPools,
      },
      attributes: {
        abilityIncreaseLevels: this.getAbilityIncreaseLevels(existingLevelCount, klassLevelEntries.length),
        attributes: character.components.abilities.getAbilitiesWithIds(),
      },
      // Per-level data for HP step, review, and auto-assignment
      levelDetails: klassLevelEntries.map(({ klass, klassLevel }, i) => ({
        klassId: klass.id,
        klassName: klass.name,
        klassLevelId: klassLevel.id,
        level: klassLevel.level,
        hd: klass.hd,
        skillPoints: perLevelSkillPoints[i],
      })),
      perLevelSkillPoints,
      perLevelSkillPointBases: this.computeSkillPointBasesPerLevel(character, klassLevelIds),
      perLevelClassSkillIds: classSkills.perLevel,
      perLevelFeatSlots,
      perLevelPowerSlots,
    };
  }

  /**
   * The planned levels (`klassLevelEntries`), built from the character's rows: the character with them (each with its
   * ability increase), and as saved.
   */
  private buildPlannedLevels(klassLevelEntries: PlannedClassLevel[]): PlannedLevels {
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

  /** Each skill's current rank, and whether it's a class skill: innate to the character, or a planned class's. */
  private buildSkillContexts(character: DetailedCharacter, classSkillIds: Set<string>) {
    const characterSkills = character.components.skills.getSkills();
    const contexts = new Map<string, { currentRank: number; isClassSkill: boolean }>();
    for (const skill of this.rulesetData.skills) {
      const skillData = characterSkills[stripSeparators(skill.name)] as { innate?: boolean; rank?: number } | undefined;
      contexts.set(skill.id, {
        isClassSkill: skillData?.innate ?? classSkillIds.has(skill.id),
        currentRank: skillData?.rank || 0,
      });
    }
    return contexts;
  }

  /**
   * What the planned levels give, the same for the preview and the save: the pools the character picks in, and each
   * level's skill points, class skills and pool slots.
   */
  private computeLevelUpPlan(planned: PlannedLevels) {
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
  private computeSkillPointBasesPerLevel(character: DetailedCharacter, klassLevelIds: string[]): number[] {
    const { skills } = character.components;
    return klassLevelIds.map((klassLevelId) =>
      skills.getLevelPointsPerLevel(
        CLASS_LEVEL_FIELDS.read(this.rulesetData.propertiesByEntity.get(klassLevelId) ?? []).skills,
      ),
    );
  }

  /** Each planned level's skill points, in the batch's order: the first counts four times over on a new character. */
  private computeSkillPointsPerLevel(
    character: DetailedCharacter,
    klassLevelIds: string[],
    existingLevelCount: number,
  ): number[] {
    const { bonusPerLevel } = character.components.skills.getSkillPointBases();
    return this.computeSkillPointBasesPerLevel(character, klassLevelIds).map((points, i) =>
      computeLevelSkillPoints(points, bonusPerLevel, existingLevelCount === 0 && i === 0),
    );
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

  /** The planned levels (by index) that take an ability increase, after the character's `existingCount` levels. */
  private getAbilityIncreaseLevels(existingCount: number, plannedCount: number) {
    const levels: number[] = [];
    for (let i = 0; i < plannedCount; i++) if (LevelRules.isAbilityIncreaseLevel(existingCount + i)) levels.push(i);
    return levels;
  }

  /** The powers the planned class levels grant, each saying whether it's free. */
  private getAutoGrantedPowers(klassLevelIds: string[]) {
    return klassLevelIds
      .flatMap((klassLevelId) => this.rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevelId) ?? [])
      .map((rec) => ({ ...rec.powersInRule, free: rec.free }));
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
   * The class skills of planned levels, from their classes (`klassIds`, one per level): each level's, in the ruleset's
   * skill order (what a rank costs at that level), and every planned class's together (the rank cap).
   */
  private getPlannedClassSkills(klassIds: string[]) {
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
  private getPlannedKlassLevels(
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

  /**
   * The character as the save leaves it: each planned level a fresh level after its saved ones, with its hit points,
   * ability and picks, as a level's edit projects it (`LevelEdit`).
   */
  private projectSavedLevels(planned: PlannedLevel[]) {
    const projection = new CharacterProjection(this.character);
    for (const { abilityId, hp, klassLevelId, picks } of planned)
      projection.pick(projection.addLevel(klassLevelId, { abilityId, hp }), this.toPickRows(picks));
    return projection;
  }

  /**
   * The level-up wizard's preview of the levels the character plans (`levels`, each with its ability increase in
   * `abilityIds`).
   */
  getPreview(levels: { klassId: string; level: number }[], abilityIds: (string | null)[]) {
    const klassLevelEntries = this.getPlannedKlassLevels(
      levels.map((level, i) => ({ ...level, abilityId: abilityIds[i] ?? null })),
    );
    return this.buildLevelUpPreview(this.buildPlannedLevels(klassLevelEntries));
  }

  /**
   * The levels a level-up saves (`levels`, with the character's pooled picks spread over them), and what the master's
   * bonded creatures (`bonded`, their rows) become with them. Each level is checked as the levels before it see it,
   * and refused when it's saved already, takes an ability increase it hasn't, or picks what it can't; the character
   * with them is refused with what it fails, unless `force`d. Each level's hit points, ability and picks are the rows
   * the save writes.
   */
  planLevels(bonded: CharacterInput[], levels: SavedLevel[], picks: LevelPicks, force: boolean) {
    const { record, rows } = this.character;
    const rulesetIds = new Set([record.rulesetId, ...this.rulesetData.cow.sourceChain]);
    const klassLevelEntries = this.getPlannedKlassLevels(levels, rulesetIds);
    // Every selection is the ruleset's before a character is built with it
    this.checkSelections(picks.skills, picks.feats, picks.powers);
    const distributed = this.distributePlannedPicks(this.buildPlannedLevels(klassLevelEntries), picks);

    // Each level sees the saved ones and those planned before it
    const otherLevels: { klassLevelId: string }[] = [...rows.levels];
    const pickedFeatIds = rows.picks.feats.map((pick) => pick.featId);
    const planned: PlannedLevel[] = [];
    for (const [i, { klass, klassLevel }] of klassLevelEntries.entries()) {
      const { hp, abilityId } = levels[i];
      const levelPicks = distributed[i];
      if (otherLevels.some((other) => other.klassLevelId === klassLevel.id))
        throw new RulesError("invalid", `Level ${i + 1}: This level has already been finalized`);
      this.checkAbilityIncrease(rows.levels.length + i, abilityId, `Level ${i + 1}: `);
      this.checkLevel({ klass, klassLevel, hp, abilityId, ...levelPicks }, otherLevels, pickedFeatIds);
      planned.push({ abilityId: abilityId || null, hp, klassLevelId: klassLevel.id, picks: levelPicks });
      otherLevels.push({ klassLevelId: klassLevel.id });
      pickedFeatIds.push(...Object.values(levelPicks.feats).flat());
    }

    const saved = this.build(this.projectSavedLevels(planned));
    if (!force) RulesError.refuseIssues(saved.validate().issues);
    return {
      bonded: BondedPlans.planMasterCreatures(saved, bonded, this.rulesetData),
      levels: planned.map(({ abilityId, hp, klassLevelId, picks: levelPicks }) => ({
        abilityId,
        hp,
        klassLevelId,
        ...this.toPickRows(levelPicks),
      })),
    };
  }
}
