import { GeneratedCode, type ImportTable } from "@/codegen/core/code/GeneratedCode.ts";
import type { Fields } from "@/shared/customization/fields.ts";
import { ENTITY_FIELDS } from "@/vocabulary/pf1/fields/index.ts";

/** A content type a Pathfinder generated file declares its values with. */
export type DeclaredType = keyof typeof DECLARED_TYPES;

/** Where each content type a generated file declares its values with comes from. */
const DECLARED_TYPES = {
  BookContent: "@/content/pf1/builders/rulesets/types.ts",
  ClassSeed: "@/content/pf1/builders/classes/types.ts",
  CowFeatEntry: "@/content/pf1/builders/rulesets/types.ts",
  CowSpellEntry: "@/content/pf1/builders/rulesets/types.ts",
  DomainSeed: "@/content/pf1/builders/domains/types.ts",
  FeatSeed: "@/content/pf1/builders/feats/types.ts",
  LeveledSpellSeed: "@/content/pf1/builders/spells/types.ts",
  Pf1ItemSeed: "@/content/pf1/builders/items/types.ts",
  RaceSeed: "@/content/pf1/builders/races/types.ts",
  SpellSeed: "@/content/pf1/builders/spells/types.ts",
};

/**
 * The stored fields of Pathfinder's entities, in the order their kinds declare them (`ENTITY_FIELDS`, a stat block's):
 * what a seed's fields are written in, each by its constant, the vocabulary's.
 */
const FIELD_ORDER = Object.values(ENTITY_FIELDS as Readonly<Record<string, Fields>>)
  .flatMap((fields) => Object.values(fields))
  .flatMap((spec) => (spec.kind === "group" ? Object.values(spec.fields) : [spec]))
  .flatMap((spec) => ("field" in spec ? [spec.field] : []));

/**
 * Where each name a generated file's code can use comes from, in the order its imports list them: the requirement
 * and item builders a feat or an item is written with, the weapons, skills and schools a feat can be made over, and
 * the stored fields a seed's fields are written by (the vocabulary's).
 */
const IMPORT_TABLE: ImportTable = [
  ["@/content/core/builders/customization/requirements.ts", ["and", "eq", "eqNum", "eqStr", "gte", "or"]],
  ["@/content/pf1/builders/feats/possession.ts", ["feat"]],
  [
    "@/content/pf1/builders/items/proficiencies.ts",
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
  ["@/content/pf1/builders/items/fields.ts", ["weaponFields", "armorFields", "shieldFields"]],
  [
    "@/vocabulary/pf1/weapons.ts",
    ["ALL_WEAPONS", "SIMPLE_WEAPONS", "MARTIAL_WEAPONS", "EXOTIC_WEAPONS", "CROSSBOW_WEAPONS"],
  ],
  ["@/vocabulary/pf1/skills.ts", ["SKILLS_WITH_CHECKS"]],
  ["@/vocabulary/pf1/spells.ts", ["MAGIC_SCHOOLS"]],
  ["@/vocabulary/pf1/fields/index.ts", FIELD_ORDER],
  ["@/shared/text.ts", ["stripSeparators"]],
];

/**
 * A Pathfinder generated file's code's core, which its concerns (`concerns/`, a kind of seed each) build on: a
 * generated file's code (`GeneratedCode`), with where the Pathfinder content types and the names its code uses come
 * from, and the order a seed's fields are written in.
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
