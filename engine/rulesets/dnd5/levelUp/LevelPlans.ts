import {
  type AdvancementPlanAnswer,
  type AdvancementPlanRequest,
  type AdvancementStep,
  type AdvancementSteps,
  Payloads,
  type PickAnswer,
  type PickedEntity,
  type ResolvedEdit,
  type ResolvedPlan,
  type StepPickerQuery,
  type StoredAdvancement,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd5/model/DetailedCharacter.ts";
import LevelRules from "@/engine/rulesets/dnd5/rules/LevelRules.ts";
import { LEVEL_WORD } from "@/vocabulary/dnd5/classes.ts";
import { CLASS_HD } from "@/vocabulary/dnd5/fields/index.ts";
import { SPELL_LEVEL_LABELS, SPELL_LEVELS } from "@/vocabulary/dnd5/spells.ts";

import LevelSelections from "./LevelSelections.ts";
import LevelUpBase from "./LevelUpBase.ts";
import LevelUpPreview from "./LevelUpPreview.ts";
import LevelUpSteps from "./LevelUpSteps.ts";
import type {
  FeatPickQuery,
  LevelEditRequest,
  LevelRequest,
  LevelUpRequest,
  PlannedSoFar,
  SpellPickQuery,
} from "./requests.ts";
import { LEVEL_WIZARD } from "./wizard.ts";

/** The feats step's answer, or the spells', as the preview and the steps answer them. */
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

/** A plan request read as the level flows take it: its levels and its picks, and the saved level it edits. */
interface ReadPlan extends LevelUpRequest {
  editedLevel?: StoredAdvancement;
}

/** A step's picker, as `openStepPicker` opens it: the class picker over the plan, or a pool's at a level. */
type StepPickerRead =
  | { kind: "feats"; query: FeatPickQuery }
  | { kind: "classes"; planned: PlannedSoFar }
  | { kind: "spells"; query: SpellPickQuery };

/** A spell's tier by its spell level, named as the sheet names it ("Cantrips", "Level 1"). */
const SPELL_TIERS = Object.fromEntries(SPELL_LEVELS.map((level) => [String(level), SPELL_LEVEL_LABELS[level]]));

/**
 * A D&D 5th Edition level's steps, in the wizard's order, each in its words: its class, its hit points, its feats (its
 * features' picks, its subclass, its feats proper) and its spells. An edit's lacks the class plan, its class the
 * level's. No ability increase or skill point is a step: a feat's.
 */
const STEPS = [
  {
    name: "class-plan",
    label: "Class Plan",
    mechanic: "plan",
    kind: "classes",
    words: { unmet: "Requirements not met" },
  },
  {
    name: "hp",
    label: "Select HP",
    mechanic: "value",
    words: { entry: "Enter HP gain", prompt: "Set HP for", unit: "HP Gain" },
  },
  {
    name: "feats",
    label: "Select Feats",
    mechanic: "pick",
    kind: "feats",
    pools: "aptitudes",
    words: {
      grantNote: LEVEL_WIZARD.freeGrantNote,
      group: { many: "variants", one: "variant" },
      optional: "optional",
    },
  },
  {
    name: "spells",
    label: "Select Spells",
    mechanic: "pick",
    kind: "spells",
    pools: "aptitudes",
    words: { grantNote: LEVEL_WIZARD.freeGrantNote, optional: "optional", tiers: SPELL_TIERS },
  },
] as const satisfies readonly AdvancementStep[];

/** Each step, by its name. */
const STEP = {
  feats: STEPS[2],
  hp: STEPS[1],
  plan: STEPS[0],
  spells: STEPS[3],
} as const;

/** Picks by pool, in the order they came: each pool's ids. */
function byPool(picks: PickedEntity[]): Record<string, string[]> {
  const pools: Record<string, string[]> = {};
  for (const { id, pool } of picks) (pools[pool] ??= []).push(id);
  return pools;
}

/** A pool step's pools as a `pick` step's: optional when the feats step shares them with the spells step. */
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
 * The D&D 5th Edition level-up's plans, as the mechanics take them: its steps, a plan request read as its level flows take it, the
 * plan's answer (Add Level's preview over its planned levels, or Edit Level's steps at the edited level, each in its
 * mechanic's shape), and a step's picker over the plan.
 */
export default class LevelPlans extends LevelUpBase<DetailedCharacter> {
  /**
   * An edit's level (`plan`, in the place of `editedLevel`) answered: its steps at the level, each in its mechanic's
   * shape, its one advancement the level's class level, its hit points bound by the class's die.
   */
  private describeLevelEdit({
    editedLevel,
    levels,
    picks,
  }: ReadPlan & { editedLevel: StoredAdvancement }): AdvancementPlanAnswer {
    const [level] = levels;
    const { klass, classLevel } = this.getSavedClassLevel(editedLevel);
    const query = { editedLevel, classId: klass.id, level: level.level, picks };
    const { feats, spells } = new LevelUpSteps(this.view, this.character, this.rules).describeLevelSteps(query);
    // The level's pools take its next pick, whichever pool and spell level: at any (`""`), and at each a pool has
    const atLevel = (pool: PoolStep["aptitudePools"][string]) => ({
      "": 0,
      ...Object.fromEntries(Object.keys(pool.levels ?? {}).map((tier) => [tier, 0])),
    });
    const hitPoints = this.levelHitPointsOf(klass, this.isFirstSaved(editedLevel));
    return {
      advancements: [{ id: classLevel.id, position: classLevel.position, track: { id: klass.id, name: klass.name } }],
      steps: {
        [STEP.hp.name]: {
          mechanic: "value",
          advancements: [{ ...hitPoints, roll: `d${klass.fields[CLASS_HD]}` }],
        },
        [STEP.feats.name]: {
          ...this.pickOf(feats, "feats", feats.aptitudePools, atLevel),
          granted: feats.autoGrantedFeats.map(({ description, id, name }) => ({ description, free: false, id, name })),
        },
        [STEP.spells.name]: {
          ...this.pickOf(spells, "spells", spells.aptitudePools, atLevel),
          granted: spells.autoGrantedSpells.map(({ description, free, id, name }) => ({ description, free, id, name })),
        },
      },
    };
  }

  /**
   * A plan's level-up (`plan`) answered: the preview of its levels, each step in its mechanic's shape. Its levels are
   * its advancements, each a class's level, its hit points bound by the class's die.
   */
  private describeLevelUp({ levels, picks }: ReadPlan): AdvancementPlanAnswer {
    const preview = new LevelUpPreview(this.view, this.character, this.rules).describePreview({ levels, picks });
    const { feats, levelDetails, nextPickLevels, spells } = preview;
    return {
      advancements: levelDetails.map((detail) => ({
        id: detail.classLevelId,
        position: detail.level,
        track: { id: detail.classId, name: detail.className },
      })),
      steps: {
        [STEP.plan.name]: { mechanic: "plan" },
        [STEP.hp.name]: {
          mechanic: "value",
          advancements: levelDetails.map(({ hd, hitPoints }) => ({ ...hitPoints, roll: `d${hd}` })),
        },
        [STEP.feats.name]: {
          ...this.pickOf(feats, "feats", nextPickLevels.feats, (id) => ({ "": id })),
          granted: feats.autoGrantedFeats.map(({ description, id, name }) => ({ description, free: false, id, name })),
        },
        [STEP.spells.name]: {
          ...this.pickOf(spells, "spells", nextPickLevels.spells, (levels) => levels),
          granted: spells.autoGrantedSpells.map(({ description, free, id, name }) => ({ description, free, id, name })),
        },
      },
    };
  }

  /**
   * The plan's levels' classes (`classIds`, in order) with the level each takes: its class's next after the character's
   * and the plan's before it (`LevelRules.numberPlannedLevels`), as the class picker offers them.
   */
  private numberPlan(classIds: string[]) {
    const levels = LevelRules.numberPlannedLevels(
      this.dnd5.classLevelsById,
      this.character.rows.advancements,
      classIds,
    );
    return classIds.map((classId, i) => ({ classId, level: levels[i] }));
  }

  /** The feats or spells (`kind`) that fit, by pool, each by name, a spell at its spell level in its pool. */
  private pickedOf(kind: "feats" | "spells", fitted: Record<string, string[]>): PickAnswer["picked"] {
    const { featsById, spellsById } = this.dnd5;
    const levels = kind === "spells" ? this.buildSpellLevelLookup(Object.values(fitted).flat()) : undefined;
    return Object.fromEntries(
      Object.entries(fitted).map(([pool, ids]) => [
        pool,
        ids.map((id) => {
          const entity = kind === "feats" ? featsById.get(id) : spellsById.get(id);
          const level = levels?.get(`${id}:${pool}`);
          return {
            description: entity?.description ?? null,
            id,
            name: entity?.name ?? id,
            ...(level !== undefined && level !== null && { tier: String(level) }),
          };
        }),
      ]),
    );
  }

  /**
   * A pool step's answer as a `pick` step's, but its grants: its pools, what fits, whether its options group, and where
   * each pool's next pick lands (`next`, read by `tiersOf`: a feat pool's at any tier, a spell pool's at each).
   */
  private pickOf<N>(
    step: PoolStep,
    kind: "feats" | "spells",
    next: Record<string, N>,
    tiersOf: (next: N) => Record<string, number>,
  ): Omit<PickAnswer, "granted"> {
    return {
      mechanic: "pick",
      fitted: step.fitted,
      grouped: kind === "feats",
      next: Object.fromEntries(Object.entries(next).map(([pool, levels]) => [pool, tiersOf(levels)])),
      picked: this.pickedOf(kind, step.fitted),
      pools: poolsOf(step),
    };
  }

  /** The plan's levels' class levels' ids, each a class's level, refused when one isn't. */
  private plannedClassLevelIds(levels: Pick<LevelRequest, "classId" | "level">[]) {
    return levels.map(({ classId, level }) => this.getClassLevel(classId, level).id);
  }

  /**
   * A plan request read as the level flows take it: its levels (an edit's, the edited level's class level), each with
   * its hit points (`needsHp`: refused when one has none; as they're projected otherwise), and its picks, pooled over
   * them.
   */
  private readPlan(request: ResolvedPlan, needsHp: boolean): ReadPlan {
    const { editedAdvancement: editedLevel } = request;
    const values = Payloads.readStep(request, STEP.hp);
    const tracks: Pick<LevelRequest, "classId" | "level">[] = editedLevel
      ? [this.trackOf(editedLevel)]
      : this.numberPlan(Payloads.readStep(request, STEP.plan).map(({ track }) => track));
    const levels = tracks.map((track, i) => {
      const hp = values[i];
      if (hp === undefined && needsHp) {
        const total = editedLevel
          ? this.character.rows.advancements.indexOf(editedLevel)
          : this.character.rows.advancements.length + i;
        throw new RulesError("invalid", `Level ${total + 1}: its hit points are required`);
      }
      return { ...track, hp: hp ?? LevelRules.UNROLLED_LEVEL_HP };
    });
    return {
      ...(editedLevel && { editedLevel }),
      levels,
      picks: {
        feats: byPool(Payloads.readStep(request, STEP.feats)),
        spells: byPool(Payloads.readStep(request, STEP.spells)),
      },
    };
  }

  /**
   * A picker's tier (`tier`) as its spell level: none at any (`""`, or none given), refused when it isn't a whole
   * number.
   */
  private readTier(tier: string | undefined) {
    if (!tier) return undefined;
    if (!/^\d+$/.test(tier)) throw new RulesError("invalid", `The tier ${tier} isn't a spell level`);
    return Number(tier);
  }

  /** The class and level of the character's saved level `level`, which an edit keeps. */
  private trackOf(level: StoredAdvancement) {
    const { klass, classLevel } = this.getSavedClassLevel(level);
    return { classId: klass.id, level: classLevel.position };
  }

  /**
   * The plan's answer: Add Level's plan over its planned levels, or Edit Level's level in its place, each step in its
   * mechanic's shape.
   */
  describePlan(request: ResolvedPlan): AdvancementPlanAnswer {
    const plan = this.readPlan(request, false);
    if (plan.levels.length === 0) throw new RulesError("invalid", "The plan takes no level");
    return plan.editedLevel
      ? this.describeLevelEdit({ ...plan, editedLevel: plan.editedLevel })
      : this.describeLevelUp(plan);
  }

  /**
   * The character's saved level `level` as an edit's plan opens it: each step's payload as the level saved it (its hit
   * points, its feats and its spells, each in its pool, a spell at its spell level). A pool's picks come in its saved
   * rows' order, by name: a save keeps no pick order, so a pool its rules shrank since drops its last by name, as Edit
   * Level's always has.
   */
  describeSavedPlan(level: StoredAdvancement): AdvancementPlanRequest {
    const saved = new LevelSelections(this.view, this.character, this.rules).describeLevel(level);
    return {
      editedAdvancementId: level.id,
      steps: {
        [STEP.hp.name]: [saved.hp],
        [STEP.feats.name]: Object.entries(saved.feats).flatMap(([pool, ids]) => ids.map((id) => ({ id, pool }))),
        [STEP.spells.name]: Object.entries(saved.spells).flatMap(([pool, spells]) =>
          spells.map(({ id, spellLevel }) => ({
            id,
            pool,
            ...(spellLevel !== undefined && { tier: String(spellLevel) }),
          })),
        ),
      },
    };
  }

  /** A level's steps, in the wizard's order: an edit's without its class plan. */
  listSteps(edited: boolean): AdvancementSteps {
    return {
      advancements: { position: LEVEL_WORD, review: "Class Advancement" },
      steps: edited ? STEPS.filter((step) => step.mechanic !== "plan") : STEPS,
    };
  }

  /** An edit as its save writes it: the edited level's hit points and picks. */
  readEdit(request: ResolvedEdit): LevelEditRequest {
    const {
      levels: [level],
      picks,
    } = this.readPlan(request, true);
    return { ...picks, hp: level.hp };
  }

  /** A level-up as its save writes it: its levels, each with its hit points, and its picks. */
  readLevelUp(request: ResolvedPlan): LevelUpRequest {
    const { levels, picks } = this.readPlan(request, true);
    if (levels.length === 0) throw new RulesError("invalid", "The plan takes no level");
    return { levels, picks };
  }

  /**
   * Step `step`'s picker over the plan (`query`): the class plan's (the classes the plan can take next, after its
   * levels and its picks), or a pool step's, at the level its next pick lands on (`query.advancement`): that level's
   * class and level, the plan's levels before it and after it, and its picks so far. Refused for a step that opens
   * none.
   */
  readStepPicker(step: string, query: StepPickerQuery<ResolvedPlan>): StepPickerRead {
    const plan = this.readPlan(query.plan, false);
    // The feats and spells picked so far, as pickers check their options against them
    const picks = this.toPickPlans(plan.picks);
    if (step === STEP.plan.name)
      return { kind: "classes", planned: { classLevelIds: this.plannedClassLevelIds(plan.levels), picks } };
    if (step !== STEP.feats.name && step !== STEP.spells.name)
      throw new RulesError("not-found", "The step has no picker");
    if (!query.pool) throw new RulesError("invalid", "The step's picker takes a pool");
    const index = plan.editedLevel ? 0 : (query.advancement ?? 0);
    const level = plan.levels[index];
    if (!level) throw new RulesError("invalid", "The plan has no such level");
    const before = plan.editedLevel ? [] : plan.levels.slice(0, index);
    const pick = {
      aptitudeId: query.pool,
      ...(plan.editedLevel && { editedLevel: plan.editedLevel }),
      classId: level.classId,
      laterClassLevelIds: plan.editedLevel ? [] : this.plannedClassLevelIds(plan.levels.slice(index + 1)),
      level: level.level,
      planned: { classLevelIds: this.plannedClassLevelIds(before), picks },
    };
    return step === STEP.feats.name
      ? { kind: "feats", query: { ...pick, family: query.group } }
      : { kind: "spells", query: { ...pick, spellLevel: this.readTier(query.tier) } };
  }
}
