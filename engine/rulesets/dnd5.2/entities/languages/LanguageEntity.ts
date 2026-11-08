import { RulesetEntity } from "@/engine/core/entities/index.ts";
import type { Dnd52Kinds } from "@/engine/rulesets/dnd5.2/view/rows.ts";

import { LANGUAGE_FIELDS } from "./fields.ts";

/** A language as the ruleset has it: its row, and its type. */
export default class LanguageEntity extends RulesetEntity<Dnd52Kinds, "languages", typeof LANGUAGE_FIELDS.fields> {
  /** Its type. */
  protected override readonly fields = LANGUAGE_FIELDS;

  override readonly type = "languages";
}
