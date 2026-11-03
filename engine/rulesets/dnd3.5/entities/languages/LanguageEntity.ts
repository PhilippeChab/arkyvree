import { RulesetEntity } from "@/engine/core/entities/index.ts";

import { LANGUAGE_FIELDS } from "./fields.ts";

/** A language as the ruleset has it: its row, and its type. */
export default class LanguageEntity extends RulesetEntity<"languages", typeof LANGUAGE_FIELDS.fields> {
  /** Its type. */
  protected override readonly fields = LANGUAGE_FIELDS;

  override readonly type = "languages";
}
