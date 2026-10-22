import { LevelUpBase } from "@/engine/core/levelUp/index.ts";
import {
  type FeatPickQuery,
  type LevelEditRequest,
  type LevelPicks,
  type LevelPlanAnswer,
  type LevelPlanRequest,
  type LevelRequest,
  type LevelStep,
  type LevelUpRequest,
  Payloads,
  type PickAnswer,
  type PickedEntity,
  type PlannedSoFar,
  type PowerPickQuery,
  type SpendAnswer,
  type StepPickerQuery,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";

import LevelUpPreview from "./LevelUpPreview.ts";
import LevelUpSteps from "./LevelUpSteps.ts";
import { LEVEL_WIZARD } from "./wizard.ts";

/** The feats step's answer, or the powers', as the preview and the steps answer them. */
interface PoolStep {
  aptitudePools: Record<
    string,
    {
      allowed: number;
      available: number;
      id: string;
      leveled?: boolean;
      levels?: Record<string, { allowed: number; available: number; spent: number }>;
      name: string;
      shared?: boolean;
      spent: number;
    }
  >;
  fitted: Record<string, string[]>;
}

/** A plan request read as the 3.5 level flows take it: its levels and its picks, and the level it edits. */
interface ReadPlan extends LevelUpRequest {
  editedLevelId?: string;
}

/** A 3.5 step's picker, as `openStepPicker` opens it: the class picker over the plan, or a pool's at a level. */
type StepPickerRead =
  | { kind: "feats"; query: FeatPickQuery }
  | { kind: "klasses"; planned: PlannedSoFar }
  | { kind: "powers"; query: PowerPickQuery };

/** A 3.5 level's steps, in the wizard's order: an edit's lacks the class plan, its class being the level's. */
const STEPS = [
  { name: "class-plan", label: "Class Plan", mechanic: "plan", kind: "klasses" },
  { name: "hp", label: "Select HP", mechanic: "value" },
  { name: "abilities", label: "Ability Increase", mechanic: "choose", kind: "abilities" },
  { name: "skills", label: "Select Skills", mechanic: "spend", kind: "skills" },
  { name: "feats", label: "Select Feats", mechanic: "pick", kind: "feats", pools: "aptitudes" },
  { name: "powers", label: "Select Spells", mechanic: "pick", kind: "powers", pools: "aptitudes" },
] as const satisfies readonly LevelStep[];

/** Each step, by its name. */
const STEP = {
  abilities: STEPS[2],
  feats: STEPS[4],
  hp: STEPS[1],
  plan: STEPS[0],
  powers: STEPS[5],
  skills: STEPS[3],
} as const;

/** Picks by pool, in the order they came: each pool's ids. */
function byPool(picks: PickedEntity[]): Record<string, string[]> {
  const pools: Record<string, string[]> = {};
  for (const { id, pool } of picks) (pools[pool] ??= []).push(id);
  return pools;
}

/** A pool step's pools as a `pick` step's: optional when the feats step shares them with the powers step. */
function poolsOf({ aptitudePools }: PoolStep): PickAnswer["pools"] {
  return Object.fromEntries(
    Object.entries(aptitudePools).map(([id, pool]) => [
      id,
      {
        allowed: pool.allowed,
        available: pool.available,
        id: pool.id,
        name: pool.name,
        optional: pool.shared ?? false,
        spent: pool.spent,
        ...(pool.leveled && pool.levels && { tiers: pool.levels }),
      },
    ]),
  );
}

/**
 * The 3.5 level-up's plans, as the mechanics take them: its steps, a plan request read as its level flows take it, the
 * plan's answer (Add Level's preview over its planned levels, or Edit Level's steps at the edited level, each in its
 * mechanic's shape), and a step's picker over the plan.
 */
export default class LevelPlans extends LevelUpBase<DetailedCharacter> {
  /**
   * An edit's level (`plan`, in the place of `editedLevelId`) answered: its steps at the level, each in its mechanic's
   * shape, its one advancement the level's class level, its hit points bound by the class's die.
   */
  private describeLevelEdit({ editedLevelId, levels, picks }: ReadPlan & { editedLevelId: string }): LevelPlanAnswer {
    const [level] = levels;
    const { klass, klassLevel } = this.getSavedKlassLevel(this.findLevel(editedLevelId));
    const query = {
      abilityIncreases: level.abilityIncreases,
      editedLevelId,
      klassId: klass.id,
      level: level.level,
      picks,
    };
    const { abilities, feats, powers, skills } = new LevelUpSteps(
      this.view,
      this.character,
      this.rules,
    ).describeLevelSteps(query);
    // The level's pools take its next pick, whichever pool and spell level
    const atLevel = (pools: Record<string, unknown>) => Object.fromEntries(Object.keys(pools).map((id) => [id, 0]));
    return {
      advancements: [{ id: klassLevel.id, position: klassLevel.level, track: { id: klass.id, name: klass.name } }],
      steps: {
        [STEP.hp.name]: {
          mechanic: "value",
          advancements: [{ ...this.rules.hitPointsOf(klass.hd), roll: `d${klass.hd}` }],
        },
        [STEP.abilities.name]: {
          mechanic: "choose",
          advancements: abilities.isAvailable ? [0] : [],
          amount: LEVEL_WIZARD.abilityIncrease.amount,
          chosen: abilities.picked,
          options: this.optionsOf(abilities.attributes),
        },
        [STEP.skills.name]: this.spendOf(skills, [skills.skillPointsToSpend]),
        [STEP.feats.name]: {
          ...this.pickOf(feats, true, atLevel(feats.aptitudePools), (index) => ({ "": index })),
          granted: feats.autoGrantedFeats.map(({ description, id, name }) => ({ description, free: false, id, name })),
        },
        [STEP.powers.name]: {
          ...this.pickOf(powers, false, atLevel(powers.aptitudePools), (index) => ({ "": index })),
          granted: powers.autoGrantedPowers.map(({ description, free, id, name }) => ({ description, free, id, name })),
        },
      },
    };
  }

  /**
   * A plan's level-up (`plan`) answered: the preview of its levels, each step in its mechanic's shape. Its levels are
   * its advancements, each a class's level, its hit points bound by the class's die.
   */
  private describeLevelUp({ levels, picks }: ReadPlan): LevelPlanAnswer {
    const preview = new LevelUpPreview(this.view, this.character, this.rules).describePreview({ levels, picks });
    const { attributes, feats, levelDetails, nextPickLevels, perLevelSkillPoints, powers, skills } = preview;
    return {
      advancements: levelDetails.map((detail) => ({
        id: detail.klassLevelId,
        position: detail.level,
        track: { id: detail.klassId, name: detail.klassName },
      })),
      steps: {
        [STEP.plan.name]: { mechanic: "plan" },
        [STEP.hp.name]: {
          mechanic: "value",
          advancements: levelDetails.map(({ hd, hitPoints }) => ({ ...hitPoints, roll: `d${hd}` })),
        },
        [STEP.abilities.name]: {
          mechanic: "choose",
          advancements: attributes.abilityIncreaseLevels,
          amount: LEVEL_WIZARD.abilityIncrease.amount,
          chosen: attributes.picked,
          options: this.optionsOf(attributes.attributes),
        },
        [STEP.skills.name]: this.spendOf(skills, perLevelSkillPoints),
        [STEP.feats.name]: {
          ...this.pickOf(feats, true, nextPickLevels.feats, (id) => ({ "": id })),
          granted: feats.autoGrantedFeats.map(({ description, id, name }) => ({ description, free: false, id, name })),
        },
        [STEP.powers.name]: {
          ...this.pickOf(powers, false, nextPickLevels.powers, (levels) => levels),
          granted: powers.autoGrantedPowers.map(({ description, free, id, name }) => ({ description, free, id, name })),
        },
      },
    };
  }

  /** The character's saved level `characterLevelId`: refused when it has none. */
  private findLevel(characterLevelId: string) {
    const level = this.character.rows.levels.find((saved) => saved.id === characterLevelId);
    if (!level) throw new RulesError("not-found", "Character level not found");
    return level;
  }

  /** The abilities an ability increase chooses among, as a `choose` step's options: each with its score and modifier. */
  private optionsOf(
    attributes: { abbreviation: string; abilityId: string; modifier: number; name: string; total: number }[],
  ) {
    return attributes.map(({ abbreviation, abilityId, modifier, name, total }) => ({
      abbreviation,
      id: abilityId,
      modifier,
      name,
      score: total,
    }));
  }

  /**
   * A pool step's answer as a `pick` step's, but its grants: its pools, what fits, whether its options group, and where
   * each pool's next pick lands (`next`, read by `tiersOf`: a feat pool's at any tier, a power pool's at each).
   */
  private pickOf<N>(
    step: PoolStep,
    grouped: boolean,
    next: Record<string, N>,
    tiersOf: (next: N) => Record<string, number>,
  ): Omit<PickAnswer, "granted"> {
    return {
      mechanic: "pick",
      fitted: step.fitted,
      grouped,
      next: Object.fromEntries(Object.entries(next).map(([pool, levels]) => [pool, tiersOf(levels)])),
      pools: poolsOf(step),
    };
  }

  /** The plan's levels' class levels' ids, each a class's level, refused when one isn't. */
  private plannedKlassLevelIds(levels: Pick<LevelRequest, "klassId" | "level">[]) {
    return levels.map(({ klassId, level }) => this.getKlassLevel(klassId, level).id);
  }

  /** The plan's picks (`picks`) as pickers check their options against them: its feats' and its powers' pairs. */
  private plannedPicks({ feats, powers }: LevelPicks): Pick<PlannedSoFar, "featPicks" | "powerPicks"> {
    return {
      featPicks: Object.entries(feats).flatMap(([aptitudeId, ids]) => ids.map((featId) => ({ aptitudeId, featId }))),
      powerPicks: Object.entries(powers).flatMap(([aptitudeId, ids]) =>
        ids.map((powerId) => ({ aptitudeId, powerId })),
      ),
    };
  }

  /**
   * A plan request read as the 3.5 level flows take it: its levels (an edit's, the edited level's class level), each
   * with its hit points (`needsHp`: refused when one has none; as they're projected otherwise) and ability increases,
   * and its picks, pooled over them.
   */
  private readPlan(request: LevelPlanRequest, needsHp: boolean): ReadPlan {
    const values = Payloads.readStep(request, STEP.hp);
    const choices = Payloads.readStep(request, STEP.abilities);
    const tracks: Pick<LevelRequest, "klassId" | "level">[] = request.editedLevelId
      ? [this.trackOf(request.editedLevelId)]
      : Payloads.readStep(request, STEP.plan).map(({ position, track }) => ({ klassId: track, level: position }));
    const levels = tracks.map((track, i) => {
      const hp = values[i];
      if (hp === undefined && needsHp) throw new RulesError("invalid", `Level ${i + 1}'s hit points are required`);
      return {
        ...track,
        abilityIncreases: (choices[i] ?? []).map(({ amount, id }) => ({ abilityId: id, amount })),
        hp: hp ?? LevelRules.UNROLLED_LEVEL_HP,
      };
    });
    return {
      ...(request.editedLevelId && { editedLevelId: request.editedLevelId }),
      levels,
      picks: {
        feats: byPool(Payloads.readStep(request, STEP.feats)),
        powers: byPool(Payloads.readStep(request, STEP.powers)),
        skills: Object.fromEntries(Payloads.readStep(request, STEP.skills).map(({ id, points }) => [id, points])),
      },
    };
  }

  /** The skills step's answer as a `spend` step's: its points over the plan, each level's, and each skill's row. */
  private spendOf(
    step: {
      skillPointsToSpend: number;
      skills: {
        classSkill: boolean;
        currentRank: number;
        description: string | null;
        family: string | null;
        id: string;
        maxPoints: number;
        name: string;
        points: number;
        ranks: number;
        ranksByPoints: number[];
        rankStep: number;
        shortName: string;
      }[];
    },
    perAdvancement: number[],
  ): SpendAnswer {
    return {
      mechanic: "spend",
      budget: step.skillPointsToSpend,
      perAdvancement,
      rows: step.skills.map((skill) => ({
        current: skill.currentRank,
        description: skill.description,
        favored: skill.classSkill,
        group: skill.family,
        id: skill.id,
        maxPoints: skill.maxPoints,
        name: skill.name,
        points: skill.points,
        shortName: skill.shortName,
        step: skill.rankStep,
        value: skill.ranks,
        valuesByPoints: skill.ranksByPoints,
      })),
    };
  }

  /** The class and level of the character's saved level `characterLevelId`, which an edit keeps. */
  private trackOf(characterLevelId: string) {
    const { klass, klassLevel } = this.getSavedKlassLevel(this.findLevel(characterLevelId));
    return { klassId: klass.id, level: klassLevel.level };
  }

  /**
   * The plan's answer: Add Level's plan over its planned levels, or Edit Level's level in its place, each step in its
   * mechanic's shape.
   */
  describePlan(request: LevelPlanRequest): LevelPlanAnswer {
    const plan = this.readPlan(request, false);
    if (plan.levels.length === 0) throw new RulesError("invalid", "The plan takes no level");
    return plan.editedLevelId
      ? this.describeLevelEdit({ ...plan, editedLevelId: plan.editedLevelId })
      : this.describeLevelUp(plan);
  }

  /** A 3.5 level's steps, in the wizard's order: an edit's without its class plan. */
  listSteps(edited: boolean): readonly LevelStep[] {
    return edited ? STEPS.filter((step) => step.mechanic !== "plan") : STEPS;
  }

  /** An edit as its save writes it: the edited level's hit points, ability increases and picks. */
  readEdit(request: LevelPlanRequest): LevelEditRequest {
    const {
      levels: [level],
      picks,
    } = this.readPlan(request, true);
    return { ...picks, abilityIncreases: level.abilityIncreases, hp: level.hp };
  }

  /** A level-up as its save writes it: its levels, each with its hit points and ability increases, and its picks. */
  readLevelUp(request: LevelPlanRequest): LevelUpRequest {
    const { levels, picks } = this.readPlan(request, true);
    if (levels.length === 0) throw new RulesError("invalid", "The plan takes no level");
    return { levels, picks };
  }

  /**
   * Step `step`'s picker over the plan (`query`): the class plan's (the classes the plan can take next, after its
   * levels and its picks), or a pool step's, at the level its next pick lands on (`query.advancement`): that level's
   * class, level and ability increases, the plan's levels before it and after it, and its picks so far. Refused for a
   * step that opens none.
   */
  readStepPicker(step: string, query: StepPickerQuery): StepPickerRead {
    const plan = this.readPlan(query.plan, false);
    const picked = this.plannedPicks(plan.picks);
    if (step === STEP.plan.name) {
      return {
        kind: "klasses",
        planned: {
          ...picked,
          abilityIncreases: plan.levels.map((level) => level.abilityIncreases),
          klassLevelIds: this.plannedKlassLevelIds(plan.levels),
          skillPoints: plan.picks.skills,
        },
      };
    }
    if ((step !== STEP.feats.name && step !== STEP.powers.name) || !query.pool)
      throw new RulesError("not-found", "The step has no picker");
    const index = plan.editedLevelId ? 0 : (query.advancement ?? 0);
    const level = plan.levels[index];
    if (!level) throw new RulesError("invalid", "The plan has no such level");
    const before = plan.editedLevelId ? [] : plan.levels.slice(0, index);
    const pick = {
      abilityIncreases: level.abilityIncreases,
      aptitudeId: query.pool,
      ...(plan.editedLevelId && { editedLevelId: plan.editedLevelId }),
      klassId: level.klassId,
      laterKlassLevelIds: plan.editedLevelId ? [] : this.plannedKlassLevelIds(plan.levels.slice(index + 1)),
      level: level.level,
      planned: {
        ...picked,
        abilityIncreases: before.map((planned) => planned.abilityIncreases),
        klassLevelIds: this.plannedKlassLevelIds(before),
      },
    };
    return step === STEP.feats.name
      ? { kind: "feats", query: { ...pick, family: query.group } }
      : { kind: "powers", query: { ...pick, powerLevel: query.tier ? Number(query.tier) : undefined } };
  }
}
