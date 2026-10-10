import {
  type CharacterInput,
  CharacterProjection,
  type LevelPickRows,
  type LevelPicks,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { type RulesetData, type RulesetView } from "@/engine/core/view/index.ts";
import CharacterBuilder from "@/engine/rulesets/dnd3.5/model/CharacterBuilder.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import SkillsComponent from "@/engine/rulesets/dnd3.5/model/skills/SkillsComponent.ts";

import BondedPlans from "./BondedPlans.ts";

/** The pools a character picks feats and powers in, and how many, with what a level-up plans. */
type LevelUpPools = ReturnType<DetailedCharacter["components"]["aptitudes"]["getLevelUpPools"]>;

/**
 * What every level-up operation reads: the ruleset's view and the character's rows (`character`), and the classes, class
 * levels and class skills the levels take.
 */
export default abstract class LevelUpState {
  constructor(
    protected readonly view: RulesetView,
    protected readonly character: CharacterInput,
  ) {}

  /** The character built from a level-up's projection of its rows: as saved, without one. */
  protected build(projection = new CharacterProjection(this.character)) {
    return CharacterBuilder.build(this.view, projection.input);
  }

  /**
   * The spell level of each of these powers in each pool it's linked to, by `powerId:aptitudeId`: a spell can be at
   * different levels in different pools (Wizard 1, Bard 0).
   */
  protected buildPowerLevelLookup(powerIds: string[]) {
    const lookup = new Map<string, number | null>();
    for (const powerId of powerIds) {
      const power = this.rulesetData.powersById.get(powerId);
      if (!power) continue;
      for (const pa of power.powersAptitudesInRules) lookup.set(`${pa.powerId}:${pa.aptitudeId}`, pa.level);
    }
    return lookup;
  }

  /**
   * A feats step, the wizard's and the preview's alike: how many feats the character picks with what's planned
   * (`pools`), in which pools, and the feats the class levels (`klassLevelIds`) grant.
   */
  protected featStep(pools: LevelUpPools, klassLevelIds: string[]) {
    const { klassLevelFeatsWithFeatsByKlassLevel } = this.rulesetData;
    return {
      featsToSelect: pools.featsToSelect,
      autoGrantedFeats: klassLevelIds.flatMap((id) =>
        (klassLevelFeatsWithFeatsByKlassLevel.get(id) ?? []).map((rec) => rec.featsInRule),
      ),
      aptitudePools: pools.featPools,
    };
  }

  /** The skills class skill records make class skills: theirs, and the ruleset's subtypes of them ("Craft (…)" of Craft). */
  protected getClassSkillIds(records: { skillId: string; skillsInRule: { name: string } }[]): Set<string> {
    const ids = new Set(records.map((record) => record.skillId));
    const names = new Set(records.map((record) => record.skillsInRule.name));
    for (const skill of this.rulesetData.skills) if (SkillsComponent.isSubtypeOf(skill.name, names)) ids.add(skill.id);

    return ids;
  }

  /** The class's level `level`, in the composed ruleset, or a 404. */
  protected getKlassLevel(klassId: string, level: number) {
    const klassLevel = this.rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
    if (!klassLevel) throw new RulesError("not-found", "Class level not found");
    return klassLevel;
  }

  /** A saved character level's class level and class, in the composed ruleset, or a 404. */
  protected getSavedKlassLevel(characterLevel: { klassLevelId: string }) {
    const klassLevel = this.rulesetData.klassLevelsById.get(characterLevel.klassLevelId);
    if (!klassLevel) throw new RulesError("not-found", "Class level not found");

    const klass = this.rulesetData.klassesById.get(klassLevel.klassId);
    if (!klass) throw new RulesError("not-found", "Class not found");

    return { klassLevel, klass };
  }

  /**
   * What the character's bonded creatures (`bonded`, their rows) become with it as `master` builds it: each kind's
   * creature removed, kept or made, and the levels it takes or loses.
   */
  protected planBondedOf(master: DetailedCharacter, bonded: CharacterInput[]) {
    return new BondedPlans(this.rulesetData).planMasterCreatures(master, bonded);
  }

  /**
   * A powers step, the wizard's and the preview's alike: how many powers the character picks with what's planned
   * (`pools`), in which pools, and the powers the class levels (`klassLevelIds`) grant, each saying whether it's free.
   */
  protected powerStep(pools: LevelUpPools, klassLevelIds: string[]) {
    const { klassLevelPowersWithPowersByKlassLevel } = this.rulesetData;
    return {
      powersToSelect: pools.powersToSelect,
      autoGrantedPowers: klassLevelIds.flatMap((id) =>
        (klassLevelPowersWithPowersByKlassLevel.get(id) ?? []).map((rec) => ({ ...rec.powersInRule, free: rec.free })),
      ),
      aptitudePools: pools.powerPools,
    };
  }

  protected get rulesetData(): RulesetData {
    return this.view.rulesetData;
  }

  /**
   * A skills step, the wizard's and the preview's alike: the points the character has to spend (at least one), each
   * skill with its class status (`classSkillIds`), and the character's total level after the step, which caps a rank.
   */
  protected skillStep(character: DetailedCharacter, classSkillIds: Set<string>, totalCharacterLevel: number) {
    const { skills } = character.components;
    return {
      skillPointsToSpend: Math.max(1, skills.getSkillBudget().available),
      totalCharacterLevel,
      skills: skills.getEnrichedSkills(this.rulesetData.skills, classSkillIds),
    };
  }

  /** A level's picks as the rows a save writes: its skill ranks but those at none, and its feats and powers by pool. */
  protected toPickRows({ feats, powers, skills }: LevelPicks): LevelPickRows {
    return {
      feats: Object.entries(feats).flatMap(([aptitudeId, ids]) => ids.map((featId) => ({ featId, aptitudeId }))),
      powers: Object.entries(powers).flatMap(([aptitudeId, ids]) => ids.map((powerId) => ({ powerId, aptitudeId }))),
      skills: Object.entries(skills)
        .filter(([, rank]) => rank > 0)
        .map(([skillId, rank]) => ({ skillId, rank })),
    };
  }
}
