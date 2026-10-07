import type { PropertyValue } from "@/engine/core/module/index.ts";
import {
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/shared/dnd3.5/properties/index.ts";

/** A skill's fields its properties hold: whether armor weighs on it, how many times over, and untrained use. */
export type SkillFields = { checkPenaltyMultiplier: number; impactedByWeight: boolean; usableWithoutTraining: boolean };

/** A skill's fields when it has none of their properties: armor doesn't weigh on it, and it needs training. */
export const NO_SKILL_FIELDS: SkillFields = {
  impactedByWeight: false,
  checkPenaltyMultiplier: 1,
  usableWithoutTraining: false,
};

/** The property types a skill's fields are stored as. */
export const SKILL_FIELD_PROPERTY_TYPES = [
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
];

/** The fields as a skill keeps them: a multiplier only counts on a skill armor weighs on, so any other takes 1. */
export function normalizeSkillFields(fields: SkillFields): SkillFields {
  return { ...fields, checkPenaltyMultiplier: fields.impactedByWeight ? fields.checkPenaltyMultiplier : 1 };
}

/**
 * A skill's fields, read off the rows of its properties in one pass: a flag true once a row says so, the multiplier
 * from the first row of a positive number, 1 without one.
 */
export function readSkillFields(properties: { type: string; value: string }[]): SkillFields {
  const fields = { ...NO_SKILL_FIELDS };
  let multiplier: number | null = null;
  for (const { type, value } of properties) {
    if (type === SKILL_IMPACTED_BY_WEIGHT && value === "true") fields.impactedByWeight = true;
    if (type === SKILL_CHECK_PENALTY_MULTIPLIER && Number(value) > 0) multiplier ??= Number(value);
    if (type === SKILL_USABLE_WITHOUT_TRAINING && value === "true") fields.usableWithoutTraining = true;
  }
  return { ...fields, checkPenaltyMultiplier: multiplier ?? 1 };
}

/**
 * A skill's fields as the properties that keep them, what a save and the seeds store: one per flag that's true, and the
 * multiplier unless it's 1.
 */
export function toSkillProperties(fields: SkillFields): PropertyValue[] {
  const property = (type: string, value: string): PropertyValue => ({ type, value });
  return [
    ...(fields.impactedByWeight ? [property(SKILL_IMPACTED_BY_WEIGHT, "true")] : []),
    // A skill takes the penalty once unless it says otherwise.
    ...(fields.checkPenaltyMultiplier === 1
      ? []
      : [property(SKILL_CHECK_PENALTY_MULTIPLIER, String(fields.checkPenaltyMultiplier))]),
    ...(fields.usableWithoutTraining ? [property(SKILL_USABLE_WITHOUT_TRAINING, "true")] : []),
  ];
}
