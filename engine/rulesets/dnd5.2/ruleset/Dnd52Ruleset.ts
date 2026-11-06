import { RulesetPart } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd5.2/characterKinds.ts";

import { RULESET_FIELDS } from "./fields.ts";
import { RULES } from "./rules.ts";

/**
 * What the D&D 5th Edition rules answer of a ruleset as a whole, past its entities: what it needs to be published, its
 * Settings (none past every ruleset's), and what every D&D 5th Edition ruleset shares (`RULES`).
 */
export default class Dnd52Ruleset extends RulesetPart {
  /** Its own fields: none past every ruleset's. */
  protected override readonly fields = RULESET_FIELDS;

  /** Its words, its kinds, its bounds and its license. */
  protected override readonly rules = RULES;

  /** What a D&D 5th Edition character is made of that the view lacks: a player species, a background, a player class, a skill, a feat. */
  protected override findMissingContent(view: RulesetView) {
    const { backgrounds, feats, classes, species, skills } = Dnd52View.of(view.rulesetData);
    return [
      { kind: "species", present: species.some((entry) => entry.partition === PLAYER_CHARACTER_KIND) },
      { kind: "background", present: backgrounds.length > 0 },
      { kind: "class", present: classes.some((klass) => klass.partition === PLAYER_CHARACTER_KIND) },
      { kind: "skill", present: skills.length > 0 },
      { kind: "feat", present: feats.length > 0 },
    ]
      .filter((content) => !content.present)
      .map((content) => content.kind);
  }
}
