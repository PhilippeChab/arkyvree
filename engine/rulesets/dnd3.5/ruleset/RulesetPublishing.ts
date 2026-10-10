import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { RulesetKind } from "@/shared/enums.ts";

/** What a 3.5 ruleset needs to be published: to be played, the content a character is made of. */
export default class RulesetPublishing {
  /**
   * Refuses publishing a ruleset as `kind` while its view gives no player race, player class, skill or feat, naming
   * those missing: no character could be made in it. An extension, an add-on to rulesets that have them, needs none.
   */
  static checkPublishable(view: RulesetView, kind: RulesetKind) {
    if (kind === "extension") return;
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
