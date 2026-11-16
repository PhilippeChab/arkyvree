import { GeneratedCode, type ImportTable } from "@/codegen/core/code/GeneratedCode.ts";
import type { Fields } from "@/shared/customization/fields.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A content type a 3.5 generated file declares its values with. */
export type DeclaredType = keyof typeof DECLARED_TYPES;

/** Where each content type a generated file declares its values with comes from. */
const DECLARED_TYPES = {
  BookContent: "@/content/dnd3.5/builders/rulesets/types.ts",
  ClassSeed: "@/content/dnd3.5/builders/classes/types.ts",
  CowFeatEntry: "@/content/dnd3.5/builders/rulesets/types.ts",
  CowSpellEntry: "@/content/dnd3.5/builders/rulesets/types.ts",
  DomainSeed: "@/content/dnd3.5/builders/domains/types.ts",
  FeatSeed: "@/content/dnd3.5/builders/feats/types.ts",
  Dnd35ItemSeed: "@/content/dnd3.5/builders/items/types.ts",
  LeveledSpellSeed: "@/content/dnd3.5/builders/spells/types.ts",
  RaceSeed: "@/content/dnd3.5/builders/races/types.ts",
  SpellSeed: "@/content/dnd3.5/builders/spells/types.ts",
  WizardSchoolSeed: "@/content/dnd3.5/builders/wizardSchools/types.ts",
};

/**
 * The stored fields of 3.5's entities, in the order their kinds declare them (`ENTITY_FIELDS`, a stat block's): what a
 * seed's fields are written in, each by its constant, the vocabulary's.
 */
const FIELD_ORDER = Object.values(ENTITY_FIELDS as Readonly<Record<string, Fields>>)
  .flatMap((fields) => Object.values(fields))
  .flatMap((spec) => (spec.kind === "group" ? Object.values(spec.fields) : [spec]))
  .flatMap((spec) => ("field" in spec ? [spec.field] : []));

/**
 * Where each name a generated file's code can use comes from, in the order its imports list them: the requirement
 * and item builders a feat template or an item is written with, the weapons, skills and schools a template is made
 * over, and the stored fields a seed's fields are written by (the vocabulary's).
 */
const IMPORT_TABLE: ImportTable = [
  ["@/content/core/builders/customization/requirements.ts", ["and", "eq", "eqNum", "eqStr", "gte", "or"]],
  ["@/content/dnd3.5/builders/feats/possession.ts", ["feat"]],
  [
    "@/content/dnd3.5/builders/items/proficiencies.ts",
    [
      "proficiencyRequirements",
      "simple",
      "martial",
      "exotic",
      "HEAVY_ARMOR_PROF",
      "LIGHT_ARMOR_PROF",
      "MEDIUM_ARMOR_PROF",
      "SHIELD_PROF",
      "TOWER_SHIELD_PROF",
    ],
  ],
  ["@/content/dnd3.5/builders/items/fields.ts", ["weaponFields", "armorFields", "shieldFields"]],
  [
    "@/vocabulary/dnd3.5/weapons.ts",
    ["ALL_WEAPONS", "SIMPLE_WEAPONS", "MARTIAL_WEAPONS", "EXOTIC_WEAPONS", "CROSSBOW_WEAPONS"],
  ],
  ["@/vocabulary/dnd3.5/skills.ts", ["SKILLS_WITH_CHECKS"]],
  ["@/vocabulary/dnd3.5/spells.ts", ["MAGIC_SCHOOLS"]],
  ["@/vocabulary/dnd3.5/fields/index.ts", FIELD_ORDER],
  ["@/shared/text.ts", ["stripSeparators"]],
];

/**
 * A 3.5 generated file's code's core, which its concerns (`concerns/`, a kind of seed each) build on: a generated
 * file's code (`GeneratedCode`), with where the 3.5 content types and the names its code uses come from, and the order
 * a seed's fields are written in.
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
