import { Field, FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { RULESET_SKILL_POINT_ABILITY_ID } from "@/vocabulary/dnd3.5/properties/index.ts";

/** A ruleset's own fields' values. */
export type RulesetFieldValues = FieldValues<typeof RULESET_FIELDS.fields>;

/**
 * A ruleset's own fields its properties hold, its Settings: the ability its characters' skill points come from, which a
 * ruleset always names. A fork holds a copy of its source's rows, which its own save replaces, and the rows of a
 * ruleset's chain read as its own, the fork's first.
 */
export const RULESET_FIELDS = new FieldCodec({
  skillPointAbilityId: Field.ref(RULESET_SKILL_POINT_ABILITY_ID, { required: true }),
});
