import { RulesetPart } from "@/engine/core/module/index.ts";

import RulesetPublishing from "./RulesetPublishing.ts";

/** What the 3.5 rules answer of a ruleset as a whole, past its entities: what it needs to be published. */
export default class Dnd35Ruleset extends RulesetPart {
  /** Refuses publishing a ruleset that lacks what a character is made of: an extension needs none. */
  checkPublishable(...args: Parameters<typeof RulesetPublishing.checkPublishable>) {
    RulesetPublishing.checkPublishable(...args);
  }
}
