import { RulesetEntity } from "@/engine/core/entities/index.ts";

import { LANGUAGE_COLUMNS } from "./columns.ts";
import { LANGUAGE_FIELDS } from "./fields.ts";

/** A language as the ruleset has it: its row, and its type. */
export default class LanguageEntity extends RulesetEntity<"languages", typeof LANGUAGE_FIELDS.fields> {
  /** Its type. */
  protected override readonly columns = LANGUAGE_COLUMNS;

  /** Its type, which its column shows. */
  protected override readonly fields = LANGUAGE_FIELDS;

  protected override readonly label = "Language";

  override readonly type = "languages";
}
