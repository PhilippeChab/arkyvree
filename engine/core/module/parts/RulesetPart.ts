import type { RulesetView } from "@/engine/core/view/index.ts";
import type { RulesetKind } from "@/shared/enums.ts";

/** What a ruleset answers of a ruleset as a whole, past its entities: what it needs to be published. */
export default abstract class RulesetPart {
  /** Refuses publishing a ruleset as `kind` while it lacks what its rules make a character of. */
  abstract checkPublishable(view: RulesetView, kind: RulesetKind): void;
}
