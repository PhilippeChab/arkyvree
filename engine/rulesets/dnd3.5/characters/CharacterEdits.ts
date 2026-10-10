import { z } from "zod";

import type { AbilityScore, NewCharacterPlan } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";

/** A form's ability scores, by ability id: each within the rules' bounds. */
const ABILITY_SCORES = z.record(z.string(), z.number().int().min(1).max(RULESET_LIMITS.abilityScore));

/** What a 3.5 character's creation and its ability edit store: its ability scores. */
export default class CharacterEdits {
  /**
   * The ability scores an edit stores (`abilities`, by ability id), each under the id its form gives. Refused when one
   * isn't an ability of the ruleset, or its score is past the rules' bounds.
   */
  static planAbilities(view: RulesetView, abilities: Record<string, number>): AbilityScore[] {
    RulesError.parse(ABILITY_SCORES, abilities);
    const { abilitiesById } = view.rulesetData;
    if (Object.keys(abilities).some((abilityId) => !abilitiesById.has(abilityId)))
      throw new RulesError("not-found", "Ability not found");
    return Object.entries(abilities).map(([abilityId, score]) => ({ abilityId, score }));
  }

  /**
   * What a new character stores beside its row: a score for each of the ruleset's abilities, the one its form gives
   * (`abilities`, by ability id) or 10. Refused when its race isn't the ruleset's or isn't a player character's, or a
   * score is past the rules' bounds.
   */
  static planCreate(view: RulesetView, body: { abilities: Record<string, number>; raceId: string }): NewCharacterPlan {
    const { rulesetData } = view;
    RulesError.parse(ABILITY_SCORES, body.abilities, ["abilities"]);
    const race = rulesetData.racesById.get(body.raceId);
    if (!race) throw new RulesError("not-found", "Race not found in this ruleset");
    if (race.kind !== "pc") throw new RulesError("invalid", "Race is not valid for a player character");
    return {
      abilities: rulesetData.abilities.map((ability) => ({
        abilityId: ability.id,
        score: body.abilities[ability.id] ?? 10,
      })),
    };
  }
}
