import { Field, FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import {
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/vocabulary/dnd3.5/properties/index.ts";

/** A skill's fields' values. */
export type SkillFieldValues = FieldValues<typeof SKILL_FIELDS.fields>;

/**
 * A skill's fields its properties hold: whether armor weighs on it, how many times over, and whether it's usable
 * untrained. Without their rows, armor doesn't weigh on it and it needs training. The multiplier only counts on a skill
 * armor weighs on: any other keeps 1.
 */
export const SKILL_FIELDS = new FieldCodec(
  {
    checkPenaltyMultiplier: Field.number(SKILL_CHECK_PENALTY_MULTIPLIER, { default: 1, min: 1 }),
    impactedByWeight: Field.flag(SKILL_IMPACTED_BY_WEIGHT),
    usableWithoutTraining: Field.flag(SKILL_USABLE_WITHOUT_TRAINING),
  },
  {
    normalize: (fields) => ({
      ...fields,
      checkPenaltyMultiplier: fields.impactedByWeight ? fields.checkPenaltyMultiplier : 1,
    }),
  },
);
