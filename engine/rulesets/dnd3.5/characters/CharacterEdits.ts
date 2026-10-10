import { z } from "zod";

import type {
  AbilitiesPlan,
  AbilitiesRequest,
  CharacterCreation,
  CreationMethod,
  NewCharacterPlan,
  NewCharacterRequest,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";
import { MIN_ABILITY_SCORE, STARTING_ABILITY_SCORE } from "@/vocabulary/dnd3.5/abilities.ts";
import { CREATION_METHODS } from "@/vocabulary/dnd3.5/creation.ts";

/** A 3.5 creation method, as its data writes it. */
type MethodData = (typeof CREATION_METHODS)[number];

/** A form's ability scores, by ability id: each within the rules' bounds. */
const ABILITY_SCORES = z.record(z.string(), z.number().int().min(MIN_ABILITY_SCORE).max(RULESET_LIMITS.abilityScore));

/**
 * What a 3.5 character's creation offers and stores, and what its ability edit stores: how its ability scores are set,
 * and the scores themselves.
 */
export default class CharacterEdits {
  /** A creation method as a form runs it: a point buy's bounds are the scores its costs price. */
  private static methodOf(method: MethodData): CreationMethod {
    if (method.kind !== "pointBuy") return method;
    const priced = Object.keys(method.costs).map(Number);
    return { ...method, max: Math.max(...priced), min: Math.min(...priced) };
  }

  /**
   * How a new character's ability scores are set: the SRD's methods, the scores' bounds and the one an unset ability
   * shows, and each score's modifier over those bounds, by the abilities' one formula.
   */
  static describeCreation(): CharacterCreation {
    const scores = { max: RULESET_LIMITS.abilityScore, min: MIN_ABILITY_SCORE, start: STARTING_ABILITY_SCORE };
    const modifiers = Object.fromEntries(
      Array.from({ length: scores.max - scores.min + 1 }, (_, index) => {
        const score = scores.min + index;
        return [score, AbilitiesComponent.computeModifier(score)];
      }),
    );
    return { methods: CREATION_METHODS.map((method) => CharacterEdits.methodOf(method)), modifiers, scores };
  }

  /**
   * The ability scores an edit stores (`abilities`, by ability id), each under the id its form gives. Refused when one
   * isn't an ability of the ruleset, or its score is past the rules' bounds.
   */
  static planAbilities(view: RulesetView, abilities: AbilitiesRequest): AbilitiesPlan {
    RulesError.parse(ABILITY_SCORES, abilities);
    const { abilitiesById } = view.rulesetData;
    if (Object.keys(abilities).some((abilityId) => !abilitiesById.has(abilityId)))
      throw new RulesError("not-found", "Ability not found");
    return { abilities: Object.entries(abilities).map(([abilityId, score]) => ({ abilityId, score })) };
  }

  /**
   * What a new character stores beside its row: a score for each of the ruleset's abilities, the one its form gives
   * (`abilities`, by ability id) or the starting one, 10. Refused when its race isn't the ruleset's or isn't a player
   * character's, or a score is past the rules' bounds.
   */
  static planCreate(view: RulesetView, request: NewCharacterRequest): NewCharacterPlan {
    const { rulesetData } = view;
    RulesError.parse(ABILITY_SCORES, request.abilities, ["abilities"]);
    const race = rulesetData.racesById.get(request.raceId);
    if (!race) throw new RulesError("not-found", "Race not found in this ruleset");
    if (race.kind !== "pc") throw new RulesError("invalid", "Race is not valid for a player character");
    return {
      abilities: rulesetData.abilities.map((ability) => ({
        abilityId: ability.id,
        score: request.abilities[ability.id] ?? STARTING_ABILITY_SCORE,
      })),
    };
  }
}
