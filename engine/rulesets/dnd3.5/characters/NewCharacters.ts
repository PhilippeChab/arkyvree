import { z } from "zod";

import type { CharacterColumns, CreationMethod, FieldsRequest, ScoresCreation } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import AbilityRules from "@/engine/rulesets/dnd3.5/rules/AbilityRules.ts";
import { ALIGNMENT_OPTIONS, GENDER_OPTIONS } from "@/shared/enums.ts";
import { MIN_ABILITY_SCORE, STARTING_ABILITY_SCORE } from "@/vocabulary/dnd3.5/abilities.ts";
import { CREATION_METHODS } from "@/vocabulary/dnd3.5/creation.ts";

/** What a new character's form reads of a ruleset's view: its abilities, each by its id and name. */
interface CreationData {
  abilities: readonly ScoresCreation["entities"][number][];
}

/** A 3.5 creation method, as its data writes it. */
type MethodData = (typeof CREATION_METHODS)[number];

/**
 * Each field a new character's form sends (`CHARACTER_FORM`'s), by its key: its experience a whole number from 0, its
 * alignment and gender among their options, all three required; its age a whole number from 1, and its texts, each
 * optional (null or empty: none).
 */
const NEW_FIELDS = z
  .object({
    age: z.number().int().min(1).nullable().optional(),
    alignment: z.enum(ALIGNMENT_OPTIONS),
    deity: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    gender: z.enum(GENDER_OPTIONS),
    height: z.string().nullable().optional(),
    weight: z.string().nullable().optional(),
    xp: z.number().int().min(0),
  })
  .strict();

/**
 * What a new 3.5 character's form offers: how its ability scores are set, their bounds and the one an unset ability
 * starts at, which the characters part checks a new character's scores and an ability edit's by.
 */
export default class NewCharacters {
  /** A creation method as a form runs it: a point buy's bounds are the scores its costs price. */
  private static methodOf(method: MethodData): CreationMethod {
    if (method.kind !== "pointBuy") return method;
    const priced = Object.keys(method.costs).map(Number);
    return { ...method, max: Math.max(...priced), min: Math.min(...priced) };
  }

  /**
   * How a new character's ability scores are set: the ruleset's abilities (`view`'s), in the order its sheet lists
   * them, the SRD's methods, the scores' bounds and the one an unset ability shows, and each score's modifier over those
   * bounds, by the abilities' one formula.
   */
  static describeCreation(data: CreationData): ScoresCreation {
    const scores = { max: RULESET_LIMITS.abilityScore, min: MIN_ABILITY_SCORE, start: STARTING_ABILITY_SCORE };
    const modifiers = Object.fromEntries(
      Array.from({ length: scores.max - scores.min + 1 }, (_, index) => {
        const score = scores.min + index;
        return [score, AbilityRules.computeModifier(score)];
      }),
    );
    const abilities = data.abilities.map(({ id, name }) => ({ id, name }));
    return {
      entities: AbilityRules.orderAbilities(abilities, (ability) => ability.name),
      methods: CREATION_METHODS.map((method) => NewCharacters.methodOf(method)),
      modifiers,
      scores,
    };
  }

  /**
   * What a new character's fields (`fields`, its form's, by their keys) write, each checked: refused when one is
   * missing that's required, names a field the form hasn't, or holds a value its field doesn't take. One left empty
   * writes nothing: its column's default.
   */
  static planFields(fields: FieldsRequest): { columns: CharacterColumns } {
    const { age, alignment, deity, description, gender, height, weight, xp } = RulesError.parse(NEW_FIELDS, fields, [
      "fields",
    ]);
    return {
      columns: {
        alignment,
        gender,
        xp,
        ...(age && { age }),
        ...(deity && { deity }),
        ...(description && { description }),
        ...(height && { height }),
        ...(weight && { weight }),
      },
    };
  }
}
