import { RulesetEntity } from "@/engine/core/entities/index.ts";
import type { Pf1Kinds } from "@/engine/rulesets/pf1/view/rows.ts";

import { LANGUAGE_FIELDS } from "./fields.ts";

/** A language as the ruleset has it: its row, and its type. */
export default class LanguageEntity extends RulesetEntity<Pf1Kinds, "languages", typeof LANGUAGE_FIELDS.fields> {
  /** Its type. */
  protected override readonly fields = LANGUAGE_FIELDS;

  override readonly type = "languages";
}
