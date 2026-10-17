import { Field, FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import {
  ABILITY_INCREASE_LEVEL_INTERVAL,
  FIRST_LEVEL_GENERAL_FEATS,
  GENERAL_FEAT_LEVEL_INTERVAL,
  MAX_CHARACTER_LEVEL,
  MAX_GENERAL_FEATS_PER_LEVEL,
} from "@/vocabulary/dnd3.5/classes.ts";
import {
  RULESET_ABILITY_INCREASES,
  RULESET_FEAT_ADVANCEMENT,
  RULESET_SKILL_POINT_ABILITY_ID,
} from "@/vocabulary/dnd3.5/properties/index.ts";

/** A ruleset's own fields' values. */
export type RulesetFieldValues = FieldValues<typeof RULESET_FIELDS.fields>;

/**
 * A ruleset's own fields its properties hold, its Settings: the ability its characters' skill points come from, which a
 * ruleset always names, and its progression, which every character follows whatever its classes: the feats its levels
 * give it to pick, and the ability increases they give, each a frequency and more at the levels it names, the core
 * rules' unless the ruleset's chain holds its own. A fork holds a copy of its source's rows, which its own save
 * replaces, and the rows of a ruleset's chain read as its own, the fork's first.
 */
export const RULESET_FIELDS = new FieldCodec({
  abilityIncreases: Field.progression(RULESET_ABILITY_INCREASES, {
    default: { every: ABILITY_INCREASE_LEVEL_INTERVAL, extra: [] },
    levels: MAX_CHARACTER_LEVEL,
    // One at most: a level's increase raises one ability, which the level-up wizard picks
    max: 1,
  }),
  featAdvancement: Field.progression(RULESET_FEAT_ADVANCEMENT, {
    default: { every: GENERAL_FEAT_LEVEL_INTERVAL, extra: [{ amount: FIRST_LEVEL_GENERAL_FEATS, level: 1 }] },
    levels: MAX_CHARACTER_LEVEL,
    max: MAX_GENERAL_FEATS_PER_LEVEL,
  }),
  skillPointAbilityId: Field.ref(RULESET_SKILL_POINT_ABILITY_ID, { required: true }),
});
