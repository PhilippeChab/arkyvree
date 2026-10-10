import { RulesetPart } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

/** What the 3.5 rules answer of a ruleset as a whole, past its entities: what it needs to be published. */
export default class Dnd35Ruleset extends RulesetPart {
  /** What a 3.5 character is made of that the view lacks: a player race, a player class, a skill, a feat. */
  protected override findMissingContent(view: RulesetView) {
    const { feats, klasses, races, skills } = view.rulesetData;
    return [
      { kind: "race", present: races.some((race) => race.kind === "pc") },
      { kind: "class", present: klasses.some((klass) => klass.kind === "pc") },
      { kind: "skill", present: skills.length > 0 },
      { kind: "feat", present: feats.length > 0 },
    ]
      .filter((content) => !content.present)
      .map((content) => content.kind);
  }
}
