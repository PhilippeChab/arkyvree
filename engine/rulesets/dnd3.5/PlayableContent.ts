import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/types.ts";

/** What a 3.5 ruleset published to be played needs: what a character is made of. */
export default class PlayableContent {
  /**
   * Refuses a ruleset whose view gives no player race, player class, skill or feat, naming those missing: no character
   * could be made in it.
   */
  static check(view: RulesetView) {
    const { feats, klasses, races, skills } = view.rulesetData;
    const missing = [
      { kind: "race", present: races.some((race) => race.kind === "pc") },
      { kind: "class", present: klasses.some((klass) => klass.kind === "pc") },
      { kind: "skill", present: skills.length > 0 },
      { kind: "feat", present: feats.length > 0 },
    ].filter((content) => !content.present);
    const kinds = missing.map((content) => content.kind).join(", ");
    if (missing.length > 0) throw new RulesError("unprocessable", `Ruleset requires at least one of each: ${kinds}`);
  }
}
