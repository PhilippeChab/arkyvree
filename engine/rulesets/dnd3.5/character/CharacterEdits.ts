import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/types.ts";

/** What a character's creation or edit stores beside its row, as its ruleset's rules say. */
export default class CharacterEdits {
  /**
   * Refuses languages a character can't speak: one of `languageIds` not found (`languages`, the rows the server read
   * for them), or not of the character's ruleset (`rulesetId`) nor of its source chain.
   */
  static checkLanguages(
    view: RulesetView,
    rulesetId: string,
    languageIds: string[],
    languages: { rulesetId: string }[],
  ) {
    if (languages.length !== languageIds.length) throw new RulesError("invalid", "Some languages were not found");
    const validRulesetIds = new Set([rulesetId, ...view.rulesetData.cow.sourceChain]);
    if (languages.some((language) => !validRulesetIds.has(language.rulesetId)))
      throw new RulesError("invalid", "Some languages do not belong to the character's ruleset");
  }

  /**
   * What a new character stores beside its row: a score for each of the ruleset's abilities, the one its form gives
   * (`abilities`, by ability id) or 10. Refused when its race isn't the ruleset's or isn't a player character's.
   */
  static planCreate(view: RulesetView, body: { abilities: Record<string, number>; raceId: string }) {
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
