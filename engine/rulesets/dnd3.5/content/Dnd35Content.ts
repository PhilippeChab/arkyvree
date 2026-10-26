import { ContentPart } from "@/engine/core/module/index.ts";
import { CLASS_FIELDS, CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import { ITEM_FIELDS } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import { RACE_FIELDS } from "@/engine/rulesets/dnd3.5/entities/races/fields.ts";
import { SKILL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/skills/fields.ts";
import { SPELL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/spells/fields.ts";
import { RULESET_FIELDS } from "@/engine/rulesets/dnd3.5/ruleset/fields.ts";

import BookPaths from "./BookPaths.ts";

/** The fields of the entities the seeders write, by entity. */
export interface SeededFields {
  classes: typeof CLASS_FIELDS.fields;
  feats: typeof FEAT_FIELDS.fields;
  items: typeof ITEM_FIELDS.fields;
  klassLevels: typeof CLASS_LEVEL_FIELDS.fields;
  races: typeof RACE_FIELDS.fields;
  rulesets: typeof RULESET_FIELDS.fields;
  skills: typeof SKILL_FIELDS.fields;
  spells: typeof SPELL_FIELDS.fields;
}

/**
 * The 3.5 module's content, as the seeders and the codegen ask of it: what a book's modifiers and requirements can
 * target, and the codecs that write an entity's fields by stored field.
 */
export default class Dnd35Content extends ContentPart<SeededFields> {
  /** The codecs of the fields the seeders write, by entity. */
  protected override readonly codecs = {
    classes: CLASS_FIELDS,
    feats: FEAT_FIELDS,
    items: ITEM_FIELDS,
    klassLevels: CLASS_LEVEL_FIELDS,
    races: RACE_FIELDS,
    rulesets: RULESET_FIELDS,
    skills: SKILL_FIELDS,
    spells: SPELL_FIELDS,
  };

  /** The target paths a book's generated content may name. */
  override listBookTargetPaths(...args: Parameters<typeof BookPaths.listBookTargetPaths>) {
    return BookPaths.listBookTargetPaths(...args);
  }
}
