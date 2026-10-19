import type { FeatPick, LevelQuery, PowerPick } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import ClassPicker from "@/engine/rulesets/dnd3.5/pickers/ClassPicker.ts";
import FeatPicker from "@/engine/rulesets/dnd3.5/pickers/FeatPicker.ts";
import PowerPicker from "@/engine/rulesets/dnd3.5/pickers/PowerPicker.ts";

import LevelUpPlan from "./LevelUpPlan.ts";
import LevelUpSteps from "./LevelUpSteps.ts";

/** The feats and powers picked so far that fit in their pools, as a picker's query takes them. */
interface PickedSoFar {
  feats: FeatPick[];
  powers: PowerPick[];
}

/** The feats and powers steps' answers, described together. */
type PickSteps = ReturnType<LevelUpSteps["describePickSteps"]>;

/** The level a step or a picker is for: the planned level's class and its next level. */
type PlannedStep = LevelQuery & { klassId: string; level: number };

/** A step's answer, as `describeStep` gives it. */
type Step = ReturnType<LevelUpSteps["describeStep"]>;

/** The picks a step fitted to their pools, each pool's, as a picker's query takes them. */
function toPicks<K extends "featId" | "powerId">(fitted: Record<string, string[]>, idKey: K) {
  return Object.entries(fitted).flatMap(([aptitudeId, ids]) =>
    ids.map((id) => ({ aptitudeId, [idKey]: id }) as { aptitudeId: string } & Record<K, string>),
  );
}

/**
 * A character's choices at its next level, opened whole: the class picker, and for a planned level of the class the
 * query names, its four steps with the picks made so far, and a picker for each pool with room left, a feat pool's and
 * a power pool's at each spell level with room left, each checking its options against the character with the picks
 * that fit (the steps' `fitted`). What the wizard refuses to plan, it refuses.
 */
export default class LevelChoices extends LevelUpSteps {
  /** The step `name`'s answer of the kind `isKind` tells. */
  private narrowStep<S extends Step>(name: string, step: LevelQuery, isKind: (answer: Step) => answer is S) {
    const answer = this.describeStep(name, step);
    if (!isKind(answer)) throw new RulesError("not-found", `Level step ${name} not found`);
    return answer;
  }

  /** A feat picker for each feat pool with room left at the level, with the feats and powers that fit so far. */
  private openFeatPools(step: PlannedStep, feats: PickSteps["feats"], picks: PickedSoFar) {
    const pools = Object.values(feats.aptitudePools).filter(({ available }) => available > 0);
    return pools.map((pool) => ({
      picker: new FeatPicker(this.view, this.character, this.pickQuery(step, pool.id, picks)),
      pool: { id: pool.id, name: pool.name },
      room: pool.available,
      shared: pool.shared,
    }));
  }

  /**
   * A power picker for each power pool with room left at the level, at each of its spell levels with room left when it
   * counts them by level, with the feats and powers that fit so far.
   */
  private openPowerPools(step: PlannedStep, powers: PickSteps["powers"], picks: PickedSoFar) {
    const rooms = Object.values(powers.aptitudePools)
      .filter(({ available }) => available > 0)
      .flatMap((pool): { pool: typeof pool; powerLevel?: number; room: number }[] =>
        pool.leveled
          ? Object.entries(pool.levels ?? {})
              .filter(([, { available }]) => available > 0)
              .map(([powerLevel, { available }]) => ({ pool, powerLevel: Number(powerLevel), room: available }))
          : [{ pool, room: pool.available }],
      );
    // A power pool that doesn't count its powers by level is a shared one: a feat pool's room too
    return rooms.map(({ pool, powerLevel, room }) => ({
      picker: new PowerPicker(this.view, this.character, { ...this.pickQuery(step, pool.id, picks), powerLevel }),
      pool: { id: pool.id, name: pool.name },
      powerLevel,
      room,
      shared: !pool.leveled,
    }));
  }

  /** A pool's picker query at the level: the level's own, with the feats and powers that fit so far. */
  private pickQuery(step: PlannedStep, aptitudeId: string, picks: PickedSoFar) {
    return { ...step, aptitudeId, planned: { ...step.planned, featPicks: picks.feats, powerPicks: picks.powers } };
  }

  /**
   * The ability increases step of the level: refused when the query sends increases that aren't the level's, as its save
   * refuses them, which the other steps and the pickers would build the character with.
   */
  private readAbilityStep(step: PlannedStep) {
    const abilities = this.narrowStep("abilities", step, (answer) => "isAvailable" in answer);
    // The levels before this one: the character's, and those planned before it
    const levelsBefore = this.character.rows.levels.length + (step.planned?.klassLevelIds?.length ?? 0);
    if (step.abilityIncreases?.length) this.checks.checkAbilityIncreases(levelsBefore, step.abilityIncreases);
    return abilities;
  }

  /**
   * The class the query plans a level of, described by the class picker: refused when the character has no next level
   * of it, doesn't qualify for it, or has no level left.
   */
  private readPlannedKlass(picker: ClassPicker, klassId: string) {
    const klass = this.rulesetData.klassesById.get(klassId);
    const [option] = klass && klass.kind === picker.filters.kind ? picker.describe([klass]) : [];
    if (!option) throw new RulesError("not-found", "The character has no next level in this class");
    if (option.levelsLeft <= 0) throw new RulesError("unprocessable", "The character has no level left to take");
    if (!option.eligible)
      throw new RulesError("unprocessable", `The character doesn't meet ${option.name}'s requirements`);
    return option;
  }

  /** The character's choices at its next level, for the class the query names, if it names one. */
  openLevelChoices(query: LevelQuery) {
    const classPicker = new ClassPicker(
      this.view,
      this.character,
      {},
      new LevelUpPlan(this.view, this.character, this.rules),
    );
    if (!query.klassId) return { classPicker, level: null };

    const klass = this.readPlannedKlass(classPicker, query.klassId);
    const step = { ...query, klassId: klass.id, level: klass.nextLevel };
    const abilities = this.readAbilityStep(step);
    const skills = this.narrowStep("skills", step, (answer) => "skillPointsToSpend" in answer);
    const { feats, powers } = this.describePickSteps(step);
    const picks = { feats: toPicks(feats.fitted, "featId"), powers: toPicks(powers.fitted, "powerId") };
    return {
      classPicker,
      level: {
        featPools: this.openFeatPools(step, feats, picks),
        powerPools: this.openPowerPools(step, powers, picks),
        steps: {
          abilities,
          class: { id: klass.id, level: klass.nextLevel, name: klass.name },
          feats: { name: "feats", ...feats },
          powers: { name: "powers", ...powers },
          skills,
        },
      },
    };
  }
}
