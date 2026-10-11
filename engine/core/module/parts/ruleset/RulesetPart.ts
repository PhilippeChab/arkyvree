import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { RulesetKind } from "@/shared/enums.ts";

/** What a ruleset answers of a ruleset as a whole, past its entities: what it needs to be published. */
export default abstract class RulesetPart {
  /** The content its rules make a character of that a ruleset's view lacks, each named by its kind (`race`, `skill`). */
  protected abstract findMissingContent(view: RulesetView): string[];

  /**
   * Refuses publishing a ruleset as `kind` while its view lacks what its rules make a character of, naming what's
   * missing: no character could be made in it. An extension, an add-on to rulesets that have them, needs none.
   */
  checkPublishable(view: RulesetView, kind: RulesetKind) {
    if (kind === "extension") return;
    const missing = this.findMissingContent(view).join(", ");
    if (missing) throw new RulesError("unprocessable", `Ruleset requires at least one of each: ${missing}`);
  }
}
