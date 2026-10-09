import { Field, FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { RULESET_SKILL_POINT_ABILITY_ID } from "@/shared/dnd3.5/properties/index.ts";

/** A ruleset's own fields' values. */
export type RulesetFieldValues = FieldValues<typeof RULESET_FIELDS.fields>;

/**
 * A ruleset's own fields its properties hold: the ability its characters' skill points come from. A fork holds a copy
 * of its source's rows, so the rows of a ruleset's chain read as its own.
 */
export const RULESET_FIELDS = new FieldCodec({ skillPointAbilityId: Field.ref(RULESET_SKILL_POINT_ABILITY_ID) });
