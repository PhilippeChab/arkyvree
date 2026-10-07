/** A generated file's imports: each name its code uses, from the module that provides it. */

/** Modules and the names a generated file can import from them, in the order its imports list them. */
export type ImportTable = [string, string[]][];

/**
 * Where each name a generated file's code can use comes from, in the order its imports list them: the requirement
 * builders, the weapon lists and the item builders a feat template or an item is written with, the skills and schools
 * a template is made over.
 */
export const IMPORT_TABLE: ImportTable = [
  [
    "@/database/packages/dnd35/content/customization/requirements.ts",
    ["and", "eq", "eqNum", "eqStr", "feat", "gte", "or"],
  ],
  [
    "@/database/packages/dnd35/content/items/weapons.ts",
    ["ALL_WEAPONS", "SIMPLE_WEAPONS", "MARTIAL_WEAPONS", "EXOTIC_WEAPONS", "CROSSBOW_WEAPONS"],
  ],
  [
    "@/database/packages/dnd35/content/items/proficiencies.ts",
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
  [
    "@/database/packages/dnd35/content/items/properties.ts",
    ["weaponProperties", "armorProperties", "shieldProperties"],
  ],
  ["@/database/packages/dnd35/data/skills.ts", ["SKILL_NAMES"]],
  ["@/shared/dnd3.5/spells.ts", ["MAGIC_SCHOOLS"]],
  ["@/shared/text.ts", ["stripSeparators"]],
];

/** Two names in lint's order, which ignores case (`sort-imports`, `member-order`). */
export function compareNames(a: string, b: string): number {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  return x < y ? -1 : x > y ? 1 : 0;
}

/** An import of `names` from `from`, the names in lint's order. */
export function formatImport(names: string[], from: string): string {
  return `import { ${[...names].sort(compareNames).join(", ")} } from "${from}";`;
}

/** The imports of the names a file's code uses (`uses`), from `table`. A name `table` doesn't list throws. */
export function formatImports(uses: Set<string>, table: ImportTable): string[] {
  const unknown = [...uses].filter((name) => !table.some(([, names]) => names.includes(name)));
  if (unknown.length > 0) throw new Error(`The generated code uses ${unknown.join(", ")}, which no import provides`);
  return table.flatMap(([from, names]) => {
    const used = names.filter((name) => uses.has(name));
    return used.length > 0 ? [formatImport(used, from)] : [];
  });
}
