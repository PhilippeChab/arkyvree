import { Field, FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import {
  ABILITY_INCREASE_LEVELS,
  GENERAL_FEAT_LEVELS,
  MAX_CHARACTER_LEVEL,
  MAX_GENERAL_FEATS_PER_LEVEL,
} from "@/vocabulary/dnd3.5/classes.ts";
import {
  RULESET_ABILITY_INCREASES_PER_LEVEL,
  RULESET_FEATS_PER_LEVEL,
  RULESET_SKILL_POINT_ABILITY_ID,
} from "@/vocabulary/dnd3.5/properties/index.ts";

/** A ruleset's own fields' values. */
export type RulesetFieldValues = FieldValues<typeof RULESET_FIELDS.fields>;

/**
 * A ruleset's own fields its properties hold, its Settings: the ability its characters' skill points come from, which a
 * ruleset always names, and its progression, which every character follows whatever its classes: the feats each
 * character level gives it to pick, and the ability increases each gives, the core rules' unless the ruleset's chain
 * holds its own. A fork holds a copy of its source's rows, which its own save replaces, and the rows of a ruleset's
 * chain read as its own, the fork's first.
 */
export const RULESET_FIELDS = new FieldCodec({
  abilityIncreasesPerLevel: Field.perLevel(RULESET_ABILITY_INCREASES_PER_LEVEL, {
    grantedAt: ABILITY_INCREASE_LEVELS,
    levels: MAX_CHARACTER_LEVEL,
    // One at most: a level's increase raises one ability, which the level-up wizard picks
    max: 1,
  }),
  featsPerLevel: Field.perLevel(RULESET_FEATS_PER_LEVEL, {
    grantedAt: GENERAL_FEAT_LEVELS,
    levels: MAX_CHARACTER_LEVEL,
    max: MAX_GENERAL_FEATS_PER_LEVEL,
  }),
  skillPointAbilityId: Field.ref(RULESET_SKILL_POINT_ABILITY_ID, { required: true }),
});
