import { RulesetEntity } from "@/engine/core/entities/index.ts";

import { LANGUAGE_COLUMNS } from "./columns.ts";
import { LANGUAGE_FIELDS } from "./fields.ts";

/** A language's form: its name, description and type. */
interface LanguageBody {
  description?: string | null;
  name: string;
  type: string;
}

/** A language as the ruleset has it: its row, and its type. */
export default class LanguageEntity extends RulesetEntity<
  "languages",
  LanguageBody,
  LanguageBody,
  typeof LANGUAGE_FIELDS.fields
> {
  /** Its type. */
  protected override readonly columns = LANGUAGE_COLUMNS;

  /** Its type, which its column shows. */
  protected override readonly fields = LANGUAGE_FIELDS;

  protected override readonly label = "Language";

  override readonly type = "languages";

  /** A form's columns. */
  protected override columnsOf({ description, name, type }: LanguageBody) {
    return { description, name, type };
  }
}
