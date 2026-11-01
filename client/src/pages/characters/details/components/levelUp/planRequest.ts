/**
 * A level wizard's plan as its form holds it, every ruleset's alike, by its steps' mechanics, and the plan request it
 * sends (`planRequestOf`): what its answer, its pickers and its save take. The form keeps each step's answer by the
 * step's name: a `value` step's and a `choose` step's by advancement (by its slot's key, which survives a slot removed
 * before it), a `spend` step's points by row and a `pick` step's picks by pool, each in the order given, which changes
 * how the engine spreads and fits them.
 */

import type { LevelStep, PlanRequest } from "./levelPlanQueries.ts";

/** What a plan request reads past the form: the level edited, and the advancements each `choose` step takes a choice at. */
interface PlanContext {
  /** The amount a `choose` step's choice raises its option by, by step name: 1 until its answer says */
  amounts?: Record<string, number>;
  /**
   * Each `choose` step's advancements that take a choice (by their index in the plan), as its last answer says: every
   * advancement before it answers
   */
  choosing?: Record<string, number[]>;
  editedLevelId?: string;
  /** A save's: every advancement's value goes with it (a plan's answer reads none) */
  saving?: boolean;
}

/**
 * A level wizard's form: by step name, each `choose` step's option chosen at each advancement, each `pick` step's picks
 * by pool, each `spend` step's points by row, and each `value` step's value at each advancement (by slot key).
 */
export interface LevelPlanForm {
  choices: Record<string, Record<number, string | null>>;
  picks: Record<string, Record<string, PlannedPick[]>>;
  points: Record<string, Record<string, number>>;
  values: Record<string, Record<number, number | null>>;
}

/** A pick a `pick` step holds: its entity, its name and description as shown, and its tier in its pool. */
export interface PlannedPick {
  description?: string | null;
  id: string;
  name: string;
  tier?: string;
}

/**
 * An advancement a wizard plans: its slot's key, which its values and choices are kept by, and, Add Level's, the track
 * it takes, which its request names alone, and the position its picker says it takes there, which the engine numbers
 * and its answer's advancement is checked against (an edit's are its level's, which the engine reads).
 */
export interface PlannedSlot {
  key: number;
  position?: number;
  track?: string;
}

/** The empty form a wizard opens with. */
export const EMPTY_PLAN: LevelPlanForm = { choices: {}, picks: {}, points: {}, values: {} };

/** A step's payload, in its mechanic's shape: what the plan request sends of the form for it, or none. */
function payloadOf(step: LevelStep, slots: PlannedSlot[], form: LevelPlanForm, context: PlanContext) {
  switch (step.mechanic) {
    case "choose": {
      // Before its first answer, every choice made goes: an edit's saved one
      const choosing = context.choosing?.[step.name];
      const amount = context.amounts?.[step.name] ?? 1;
      return slots.map(({ key }, index) => {
        const id = form.choices[step.name]?.[key];
        return id && (!choosing || choosing.includes(index)) ? [{ amount, id }] : [];
      });
    }
    case "pick":
      return Object.entries(form.picks[step.name] ?? {}).flatMap(([pool, picks]) =>
        picks.map(({ id, tier }) => ({ id, pool, ...(tier !== undefined && { tier }) })),
      );
    case "plan":
      return slots.flatMap(({ track }) => (track !== undefined ? [{ track }] : []));
    case "spend":
      return Object.entries(form.points[step.name] ?? {})
        .filter(([, points]) => points > 0)
        .map(([id, points]) => ({ id, points }));
    case "value": {
      if (!context.saving) return undefined;
      const values = slots.map(({ key }) => form.values[step.name]?.[key]);
      return values.every((value) => typeof value === "number") ? values : undefined;
    }
  }
}

/**
 * The plan request a wizard's form (`form`) makes over its advancements (`slots`): each step's payload by its name,
 * and the level it edits. A `value` step's only goes with a save, every advancement's set; a `choose` step's choice
 * only at an advancement its last answer says takes one, once it has answered.
 */
export function planRequestOf(
  steps: readonly LevelStep[],
  slots: PlannedSlot[],
  form: LevelPlanForm,
  context: PlanContext = {},
): PlanRequest {
  const payloads: PlanRequest["steps"] = {};
  for (const step of steps) {
    const payload = payloadOf(step, slots, form, context);
    if (payload) payloads[step.name] = payload;
  }
  return { ...(context.editedLevelId && { editedLevelId: context.editedLevelId }), steps: payloads };
}
