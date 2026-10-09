import { PlainEntity } from "@/engine/core/entities/index.ts";

/** A language's form: its name, description and type. */
type LanguageBody = { description?: string | null; name: string; type: string };

/** A language as the ruleset has it: its row, and its type. */
export default class LanguageEntity extends PlainEntity<"languages", LanguageBody> {
  protected readonly label = "Language";

  readonly type = "languages";

  /** A form's columns. */
  protected columnsOf({ description, name, type }: LanguageBody) {
    return { description, name, type };
  }
}
