import { GeneratedCode, type ImportTable } from "@/codegen/core/code/GeneratedCode.ts";

/** A content type a 3.5 generated file declares its values with. */
export type DeclaredType = keyof typeof DECLARED_TYPES;

/** Where each content type a generated file declares its values with comes from. */
const DECLARED_TYPES = {
  BookContent: "@/content/dnd3.5/builders/rulesets/types.ts",
  ClassSeed: "@/content/dnd3.5/builders/classes/types.ts",
  CowFeatEntry: "@/content/dnd3.5/builders/rulesets/types.ts",
  CowSpellEntry: "@/content/dnd3.5/builders/rulesets/types.ts",
  DomainSeed: "@/content/dnd3.5/builders/domains/types.ts",
  FeatSeed: "@/content/core/builders/feats/types.ts",
  ItemSeed: "@/content/core/builders/items/types.ts",
  PowerSeed: "@/content/dnd3.5/builders/spells/types.ts",
  RaceSeed: "@/content/core/builders/races/types.ts",
  SpellSeed: "@/content/dnd3.5/builders/spells/types.ts",
  WizardSchoolSeed: "@/content/dnd3.5/builders/wizardSchools/types.ts",
};

/**
 * Where each name a generated file's code can use comes from, in the order its imports list them: the requirement
 * and item builders a feat template or an item is written with, and the weapons, skills and schools a template is made
 * over (the vocabulary's).
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
  ["@/content/dnd3.5/builders/items/properties.ts", ["weaponProperties", "armorProperties", "shieldProperties"]],
  [
    "@/vocabulary/dnd3.5/weapons.ts",
    ["ALL_WEAPONS", "SIMPLE_WEAPONS", "MARTIAL_WEAPONS", "EXOTIC_WEAPONS", "CROSSBOW_WEAPONS"],
  ],
  ["@/vocabulary/dnd3.5/skills.ts", ["SKILL_NAMES"]],
  ["@/vocabulary/dnd3.5/spells.ts", ["MAGIC_SCHOOLS"]],
  ["@/shared/text.ts", ["stripSeparators"]],
];

/**
 * A 3.5 generated file's code's core, which its concerns (`concerns/`, a kind of seed each) build on: a generated file's
 * code (`GeneratedCode`), with where the 3.5 content types and the names its code uses come from.
 */
export class BaseCodeFile extends GeneratedCode<DeclaredType> {
  protected override readonly declaredTypes = DECLARED_TYPES;

  protected override readonly importTable = IMPORT_TABLE;
}
