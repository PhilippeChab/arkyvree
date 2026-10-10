import { ContentPart } from "@/engine/core/module/index.ts";
import { CLASS_FIELDS, CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { SKILL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/skills/fields.ts";
import { RULESET_FIELDS } from "@/engine/rulesets/dnd3.5/ruleset/fields.ts";

import BookPaths from "./BookPaths.ts";

/** The fields of the entities the seeders write as their properties, by entity. */
export interface SeededFields {
  klasses: typeof CLASS_FIELDS.fields;
  klassLevels: typeof CLASS_LEVEL_FIELDS.fields;
  rulesets: typeof RULESET_FIELDS.fields;
  skills: typeof SKILL_FIELDS.fields;
}

/**
 * The 3.5 module's content, as the seeders and the codegen ask of it: what a book's modifiers and requirements can
 * target, and the codecs that keep an entity's fields in its properties.
 */
export default class Dnd35Content extends ContentPart<SeededFields> {
  /** The codecs of the fields the seeders write as properties, by entity. */
  protected override readonly codecs = {
    klasses: CLASS_FIELDS,
    klassLevels: CLASS_LEVEL_FIELDS,
    rulesets: RULESET_FIELDS,
    skills: SKILL_FIELDS,
  };

  /** The target paths a book's generated content may name. */
  override listBookTargetPaths(...args: Parameters<typeof BookPaths.listBookTargetPaths>) {
    return BookPaths.listBookTargetPaths(...args);
  }
}
