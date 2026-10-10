import { RulesetEntity } from "@/engine/core/entities/index.ts";
import { FieldCodec } from "@/engine/core/fields/index.ts";

/** A language's form: its name, description and type. */
type LanguageBody = { description?: string | null; name: string; type: string };

/** A language as the ruleset has it: its row, and its type. */
export default class LanguageEntity extends RulesetEntity<"languages", LanguageBody> {
  /** None of its own. */
  protected readonly fields = FieldCodec.NONE;

  protected readonly label = "Language";

  readonly type = "languages";

  /** A form's columns. */
  protected columnsOf({ description, name, type }: LanguageBody) {
    return { description, name, type };
  }
}
