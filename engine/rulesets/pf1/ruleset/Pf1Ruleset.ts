import { RulesetPart } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Pf1View from "@/engine/rulesets/pf1/view/Pf1View.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/pf1/bondedKinds.ts";

import { RULESET_FIELDS } from "./fields.ts";
import { RULES } from "./rules.ts";

/**
 * What the Pathfinder rules answer of a ruleset as a whole, past its entities: what it needs to be published, its Settings
 * (the ability its characters' skill points come from), and what every Pathfinder ruleset shares (`RULES`).
 */
export default class Pf1Ruleset extends RulesetPart {
  /** The ability its characters' skill points come from. */
  protected override readonly fields = RULESET_FIELDS;

  /** Its words, its kinds, its bounds and its license. */
  protected override readonly rules = RULES;

  /** What a Pathfinder character is made of that the view lacks: a player race, a player class, a skill, a feat. */
  protected override findMissingContent(view: RulesetView) {
    const { feats, classes, races, skills } = Pf1View.of(view.rulesetData);
    return [
      { kind: "race", present: races.some((race) => race.partition === PLAYER_CHARACTER_KIND) },
      { kind: "class", present: classes.some((klass) => klass.partition === PLAYER_CHARACTER_KIND) },
      { kind: "skill", present: skills.length > 0 },
      { kind: "feat", present: feats.length > 0 },
    ]
      .filter((content) => !content.present)
      .map((content) => content.kind);
  }
}
