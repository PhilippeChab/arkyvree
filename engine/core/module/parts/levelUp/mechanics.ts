/**
 * The level-up steps' mechanics, which every ruleset's steps are: what a step asks, the shape its answer takes and the
 * shape its payload takes, in no game's nouns. A module lists a level's steps, each with its mechanic, and answers each
 * in its mechanic's shape (`describePlan`); a wizard renders a step by its mechanic alone.
 *
 * - `plan`: which track each advancement takes, at its next position (3.5's class plan: a class, at its next level).
 * - `value`: a number per advancement, within bounds (3.5's hit points).
 * - `choose`: options to raise, per advancement that takes a choice, by a described amount (3.5's ability increase).
 * - `spend`: a budget of points over rows, each buying value at its own rate (3.5's skills).
 * - `pick`: entities of a kind into pools, each pool with its room, maybe by tier (3.5's feats, and its spells by
 *   level).
 */

import type { RulesWord } from "@/engine/core/module/parts/ruleset/index.ts";
import type { ViewEntities } from "@/engine/core/view/index.ts";

/** An option a `choose` step raises: its name and short name, and its score and modifier as the plan has them. */
export interface ChoiceOption {
  abbreviation: string;
  id: string;
  modifier: number;
  name: string;
  score: number;
}

/**
 * A `choose` step's answer: the advancements (by their index in the plan) that take a choice, each raising an option by
 * `amount`; the options; and whether every one of them is chosen, which the step's Next waits for.
 */
export interface ChooseAnswer {
  advancements: number[];
  amount: number;
  chosen: boolean;
  mechanic: "choose";
  options: ChoiceOption[];
}

/** An option a `choose` step's payload raises, by how much. */
export interface ChosenOption {
  amount: number;
  id: string;
}

/** An entity a plan's advancements grant a `pick` step's character, free of a pool's room when `free`. */
export interface GrantedEntity {
  description: string | null;
  free: boolean;
  id: string;
  name: string;
}

/** The plan's answer: its advancements, in order, and each step's answer by its name. */
export interface LevelPlanAnswer {
  advancements: PlannedAdvancementAnswer[];
  steps: Record<string, StepAnswer>;
}

/**
 * A plan, as a wizard sends it: each step's payload by its name, and the level it edits in place (`editedLevelId`), its
 * one advancement, when it edits one.
 */
export interface LevelPlanRequest {
  editedLevelId?: string;
  steps: Record<string, StepPayload>;
}

/**
 * A `pick` step's answer: its pools, what the plan's advancements grant, what of the picks fits (by pool, in pick
 * order: `fitted`'s ids, `picked`'s entities), the advancement (by its index in the plan) each pool's next pick lands
 * on, at any tier (`""`) and at each, and whether its options group (3.5's feat families).
 */
export interface PickAnswer {
  fitted: Record<string, string[]>;
  granted: GrantedEntity[];
  grouped: boolean;
  mechanic: "pick";
  next: Record<string, Record<string, number>>;
  picked: Record<string, PickedEntityAnswer[]>;
  pools: Record<string, PickPool>;
}

/** An entity a `pick` step's payload picks, in a pool, at a tier when the pool has tiers. */
export interface PickedEntity {
  id: string;
  pool: string;
  tier?: string;
}

/** An entity a `pick` step's picks hold, by name, at the tier it's picked at in its pool. */
export interface PickedEntityAnswer {
  description: string | null;
  id: string;
  name: string;
  tier?: string;
}

/**
 * A pool a `pick` step picks in: its room (allowed, spent, what's left) and, when its entities go by tier, its room at
 * each tier; optional when another step's picks share it.
 */
export interface PickPool {
  allowed: number;
  available: number;
  id: string;
  name: string;
  optional: boolean;
  spent: number;
  tiers?: Record<string, TierRoom>;
}

/** A `plan` step's answer: the advancements are the plan's own (`LevelPlanAnswer`), its options a picker's. */
export interface PlanAnswer {
  mechanic: "plan";
}

/**
 * A `plan` step's payload's advancement: the track it takes (3.5's class) and its position on it (the class's level).
 */
export interface PlannedAdvancement {
  position: number;
  track: string;
}

/** An advancement a plan takes, as its answer reads it: its entry (3.5's class level), its track and its position. */
export interface PlannedAdvancementAnswer {
  id: string;
  position: number;
  track: { id: string; name: string };
}

/** A `spend` step's answer: the points to spend over the plan, those each advancement gives, and the rows. */
export interface SpendAnswer {
  budget: number;
  mechanic: "spend";
  perAdvancement: number[];
  rows: SpendRow[];
}

/**
 * A row a `spend` step spends points on: its name, group and short name (a family's rows show together), its value
 * before the plan (`current`), whether the plan favors it, the points spent on it and the value they buy (`points`,
 * `value`), the value at each number of points (`valuesByPoints`, from none), the step its value moves by, and the most
 * points it keeps when spent alone.
 */
export interface SpendRow {
  current: number;
  description: string | null;
  favored: boolean;
  group: string | null;
  id: string;
  maxPoints: number;
  name: string;
  points: number;
  shortName: string;
  step: number;
  value: number;
  valuesByPoints: number[];
}

/** Points a `spend` step's payload spends on a row. */
export interface SpentPoints {
  id: string;
  points: number;
}

/**
 * Each mechanic's payload: a plan's advancements; a value per advancement; the options chosen at each advancement; the
 * points spent, in the order spent (it changes how they spread); the entities picked, in pick order (fitting drops the
 * latest).
 */
export interface StepPayloads {
  choose: ChosenOption[][];
  pick: PickedEntity[];
  plan: PlannedAdvancement[];
  spend: SpentPoints[];
  value: number[];
}

/**
 * A step's picker, over a plan: the plan so far (`plan`), the advancement (by its index in the plan) its pick lands on
 * (a pool's `next`), the pool and the tier it picks in, and the group whose members it lists (3.5's feat family).
 */
export interface StepPickerQuery {
  advancement?: number;
  group?: string;
  plan: LevelPlanRequest;
  pool?: string;
  tier?: string;
}

/**
 * The words a step shows past its label and its kind's word, by its mechanic, its module's:
 * - `choose`: what it asks, and its word ("Ability Increase");
 * - `pick`: the note a free grant takes ("class ability"), and each tier's name ("Cantrips");
 * - `plan`: a position's word ("Level"), the review's title for the advancements, and an option the character can't
 *   take yet's note;
 * - `spend`: the budget's title, a favored row's words (in full, and short), the review's title, and what a point buys;
 * - `value`: what each advancement's value asks, and the value's name.
 */
export interface StepWords {
  choose: { prompt: string; word: RulesWord };
  pick: { grantNote: string; tiers?: Record<string, string> };
  plan: { position: string; review: string; unmet: string };
  spend: { budget: string; favored: string; favoredShort: string; review: string; unit: RulesWord };
  value: { prompt: string; unit: string };
}

/** A pool's room at a tier: allowed (`-1` when every entity of the tier is held), spent, and what's left. */
export interface TierRoom {
  allowed: number;
  available: number;
  spent: number;
}

/** A `value` step's answer: each advancement's bounds, in the plan's order. */
export interface ValueAnswer {
  advancements: ValueBounds[];
  mechanic: "value";
}

/** The bounds of a `value` step's number at an advancement, its average between, and the words for a roll ("d10"). */
export interface ValueBounds {
  average: number;
  max: number;
  min: number;
  roll: string;
}

/**
 * A level-up step, as its module lists it: its name (which a plan request's payloads and a plan's answers key it by),
 * its mechanic, the kind of entity it plans, chooses, spends over or picks (`kind`), the kind of entity a `pick` step's
 * pools are (`pools`), its label, and its mechanic's words.
 */
export type LevelStep = {
  [M in StepMechanic]: {
    kind?: keyof ViewEntities;
    label: string;
    mechanic: M;
    name: string;
    pools?: keyof ViewEntities;
    words: StepWords[M];
  };
}[StepMechanic];

/** A step's answer, by its mechanic. */
export type StepAnswer = ChooseAnswer | PickAnswer | PlanAnswer | SpendAnswer | ValueAnswer;

/** What a level-up step does, which a wizard renders it by. */
export type StepMechanic = "choose" | "pick" | "plan" | "spend" | "value";

/** A step's payload, any mechanic's. */
export type StepPayload = StepPayloads[StepMechanic];
