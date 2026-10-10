import type { NewCharacterPlan } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

/** What a 3.5 character's creation stores beside its row: its ability scores. */
export default class CharacterEdits {
  /**
   * What a new character stores beside its row: a score for each of the ruleset's abilities, the one its form gives
   * (`abilities`, by ability id) or 10. Refused when its race isn't the ruleset's or isn't a player character's.
   */
  static planCreate(view: RulesetView, body: { abilities: Record<string, number>; raceId: string }): NewCharacterPlan {
    const { rulesetData } = view;
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
