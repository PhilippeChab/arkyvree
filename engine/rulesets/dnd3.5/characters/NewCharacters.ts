import type { CharacterCreation, CreationMethod } from "@/engine/core/module/index.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import AbilityRules from "@/engine/rulesets/dnd3.5/rules/AbilityRules.ts";
import { MIN_ABILITY_SCORE, STARTING_ABILITY_SCORE } from "@/vocabulary/dnd3.5/abilities.ts";
import { CREATION_METHODS } from "@/vocabulary/dnd3.5/creation.ts";

/** What a new character's form reads of a ruleset's view: its abilities, each by its id and name. */
interface CreationView {
  rulesetData: { abilities: readonly CharacterCreation["abilities"][number][] };
}

/** A 3.5 creation method, as its data writes it. */
type MethodData = (typeof CREATION_METHODS)[number];

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
  static describeCreation(view: CreationView): CharacterCreation {
    const scores = { max: RULESET_LIMITS.abilityScore, min: MIN_ABILITY_SCORE, start: STARTING_ABILITY_SCORE };
    const modifiers = Object.fromEntries(
      Array.from({ length: scores.max - scores.min + 1 }, (_, index) => {
        const score = scores.min + index;
        return [score, AbilityRules.computeModifier(score)];
      }),
    );
    const abilities = view.rulesetData.abilities.map(({ id, name }) => ({ id, name }));
    return {
      abilities: AbilityRules.orderAbilities(abilities, (ability) => ability.name),
      methods: CREATION_METHODS.map((method) => NewCharacters.methodOf(method)),
      modifiers,
      scores,
    };
  }
}
