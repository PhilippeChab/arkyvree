import { z } from "zod";

import {
  type CreationMethod,
  FieldInputs,
  type FieldsPlan,
  type FieldsRequest,
  type ScoresCreation,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import AbilityRules from "@/engine/rulesets/dnd3.5/rules/AbilityRules.ts";
import { MIN_ABILITY_SCORE, STARTING_ABILITY_SCORE } from "@/vocabulary/dnd3.5/abilities.ts";
import { CREATION_METHODS } from "@/vocabulary/dnd3.5/creation.ts";
import { CHARACTER_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

import CharacterValues from "./CharacterValues.ts";

/** What a new character's form reads of a ruleset's view: its abilities, each by its id and name. */
interface CreationData {
  abilities: readonly ScoresCreation["entities"][number][];
}

/** A 3.5 creation method, as its data writes it. */
type MethodData = (typeof CREATION_METHODS)[number];

/** The row's own column a new character's form sends among its fields, by its key: its description, a text or none. */
const OWN_REQUEST = z.object({ description: z.string().nullable().optional() });

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
   * What a new character's fields (`fields`, its form's, by the stored field that keeps each, and its description)
   * write, each read by the character's codec as an entity's form is (`CharacterValues.parseForm`): refused when one its
   * forms never leave at none is missing (`FieldInputs.parseNew`: its alignment, its gender, its experience), one names
   * a field the character hasn't, or holds a value its field doesn't take, each refused together. One left empty writes
   * nothing: no value, no description.
   */
  static planFields(view: RulesetView, fields: FieldsRequest): FieldsPlan {
    const { description, ...given } = fields;
    const own = RulesError.parse(OWN_REQUEST, { description }, ["fields"]);
    const parsed = FieldInputs.parseNew(CHARACTER_FIELDS, given, (sent) => CharacterValues.parseForm(view, sent));
    const written = CharacterValues.writeOf(parsed);
    const values = Object.fromEntries(Object.entries(written).filter(([, value]) => value !== null));
    return { fields: values, own: { ...(own.description && { description: own.description }) } };
  }
}
