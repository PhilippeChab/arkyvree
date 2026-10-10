import { FieldCodec } from "@/engine/core/fields/index.ts";

import RulesetEntity from "./RulesetEntity.ts";

/** A language's form: its name, description and type. */
type LanguageBody = { description?: string | null; name: string; type: string };

/** A language as the ruleset has it: its row, and its type. */
export default class LanguageEntity extends RulesetEntity<"languages", LanguageBody> {
  /** None of its own. */
  protected override readonly fields = FieldCodec.NONE;

  protected override readonly label = "Language";

  override readonly type = "languages";

  /** A form's columns. */
  protected override columnsOf({ description, name, type }: LanguageBody) {
    return { description, name, type };
  }
}
