import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

/** What the 3.5 rules answer of a ruleset as a whole, past its entities: what it needs to be played. */
export default class Dnd35Ruleset {
  /**
   * Refuses a ruleset whose view gives no player race, player class, skill or feat, naming those missing: no character
   * could be made in it, so it can't be published to be played.
   */
  checkPlayable(view: RulesetView) {
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
