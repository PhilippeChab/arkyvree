import type { NewCharacterPlan } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

/** What a character's creation or edit stores beside its row, as its ruleset's rules say. */
export default class CharacterEdits {
  /**
   * Refuses rows a character can't take from its ruleset (`rows`, each with the ruleset it's of): rows of neither the
   * view's ruleset, the character's, nor its source chain.
   */
  static checkFromRuleset(view: RulesetView, rows: { rulesetId: string }[], message: string) {
    const rulesetIds = new Set([view.ruleset.id, ...view.rulesetData.cow.sourceChain]);
    if (rows.some((row) => !rulesetIds.has(row.rulesetId))) throw new RulesError("invalid", message);
  }

  /**
   * Refuses languages a character can't speak: one of `languageIds` not found (`languages`, the rows the server read
   * for them), or not of the character's ruleset nor of its source chain.
   */
  static checkLanguages(view: RulesetView, languageIds: string[], languages: { rulesetId: string }[]) {
    if (languages.length !== languageIds.length) throw new RulesError("invalid", "Some languages were not found");
    CharacterEdits.checkFromRuleset(view, languages, "Some languages do not belong to the character's ruleset");
  }

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
