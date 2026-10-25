import { RulesetPart } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";

import { RULESET_FIELDS } from "./fields.ts";
import { RULES } from "./rules.ts";

/**
 * What the 3.5 rules answer of a ruleset as a whole, past its entities: what it needs to be published, its Settings
 * (the ability its characters' skill points come from), and what every 3.5 ruleset shares (`RULES`).
 */
export default class Dnd35Ruleset extends RulesetPart {
  /** The ability its characters' skill points come from. */
  protected override readonly fields = RULESET_FIELDS;

  /** Its words, its kinds, its bounds and its license. */
  protected override readonly rules = RULES;

  /** What a 3.5 character is made of that the view lacks: a player race, a player class, a skill, a feat. */
  protected override findMissingContent(view: RulesetView) {
    const { feats, klasses, races, skills } = Dnd35View.of(view.rulesetData);
    return [
      { kind: "race", present: races.some((race) => race.partition === "pc") },
      { kind: "class", present: klasses.some((klass) => klass.partition === "pc") },
      { kind: "skill", present: skills.length > 0 },
      { kind: "feat", present: feats.length > 0 },
    ]
      .filter((content) => !content.present)
      .map((content) => content.kind);
  }
}
