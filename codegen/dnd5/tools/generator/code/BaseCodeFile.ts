import { GeneratedCode, type ImportTable } from "@/codegen/core/code/GeneratedCode.ts";
import type { Fields } from "@/shared/customization/fields.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd5/fields/index.ts";

/** A content type a D&D 5th Edition generated file declares its values with. */
export type DeclaredType = keyof typeof DECLARED_TYPES;

/** Where each content type a generated file declares its values with comes from. */
const DECLARED_TYPES = {
  BackgroundSeed: "@/content/dnd5/builders/backgrounds/types.ts",
  BookContent: "@/content/dnd5/builders/rulesets/types.ts",
  ClassSeed: "@/content/dnd5/builders/classes/types.ts",
  Dnd5ItemSeed: "@/content/dnd5/builders/items/types.ts",
  FeatSeed: "@/content/dnd5/builders/feats/types.ts",
  LeveledSpellSeed: "@/content/dnd5/builders/spells/types.ts",
  SpeciesSeed: "@/content/dnd5/builders/species/types.ts",
  SpellSeed: "@/content/dnd5/builders/spells/types.ts",
};

/**
 * The stored fields of D&D 5th Edition's entities, in the order their kinds declare them (`ENTITY_FIELDS`, a stat
 * block's): what a seed's fields are written in, each by its constant, the vocabulary's.
 */
const FIELD_ORDER = Object.values(ENTITY_FIELDS as Readonly<Record<string, Fields>>)
  .flatMap((fields) => Object.values(fields))
  .flatMap((spec) => (spec.kind === "group" ? Object.values(spec.fields) : [spec]))
  .flatMap((spec) => ("field" in spec ? [spec.field] : []));

/**
 * Where each name a generated file's code can use comes from, in the order its imports list them: the requirement
 * builders a check is written with, the item builders a template's fields are, and the stored fields a seed's fields
 * are written by (the vocabulary's).
 */
const IMPORT_TABLE: ImportTable = [
  ["@/content/core/builders/customization/requirements.ts", ["and", "eq", "eqNum", "eqStr", "gte", "or"]],
  ["@/content/dnd5/builders/items/fields.ts", ["armorFields", "shieldFields", "weaponFields"]],
  ["@/vocabulary/dnd5/fields/index.ts", FIELD_ORDER],
];

/**
 * A D&D 5th Edition generated file's code's core, which its concerns (`concerns/`, a kind of seed each) build on: a
 * generated file's code (`GeneratedCode`), with where the content types and the names its code uses come from, and the
 * order a seed's fields are written in.
 */
export class BaseCodeFile extends GeneratedCode<DeclaredType> {
  protected override readonly declaredTypes = DECLARED_TYPES;

  protected override readonly importTable = IMPORT_TABLE;

  /**
   * A seed's fields as stored written as code (`storedFields`), in the order their kinds declare them, `spread` (a
   * builder's call that gives the others) after them.
   */
  seedFields(fields: Readonly<Record<string, unknown>>, spread?: string): string {
    const rank = (field: string) => FIELD_ORDER.indexOf(field);
    const sorted = Object.entries(fields).toSorted(([a], [b]) => rank(a) - rank(b));
    return this.storedFields(Object.fromEntries(sorted), spread);
  }
}
