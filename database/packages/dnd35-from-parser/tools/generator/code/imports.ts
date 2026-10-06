/** A generated file's imports: each name its code uses, from the module that provides it. */

/** Modules and the names a generated file can import from them, in the order its imports list them. */
export type ImportTable = [string, string[]][];

/** The requirement builders a generated file imports. */
export const REQUIREMENT_IMPORTS: ImportTable = [
  [
    "@/database/packages/dnd35/content/customization/requirements.ts",
    ["and", "eq", "eqNum", "eqStr", "feat", "gte", "or"],
  ],
];

/** An import of `names` from `from`, the names in lint's order (`sort-imports`, which ignores case). */
export function importLine(names: string[], from: string): string {
  const sorted = [...names].sort((a, b) => {
    const [x, y] = [a.toLowerCase(), b.toLowerCase()];
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return `import { ${sorted.join(", ")} } from "${from}";`;
}

/** The imports of the names a file's code uses (`uses`), from `table`. A name `table` doesn't list throws. */
export function importLines(uses: Set<string>, table: ImportTable): string[] {
  const unknown = [...uses].filter((name) => !table.some(([, names]) => names.includes(name)));
  if (unknown.length > 0) throw new Error(`The generated code uses ${unknown.join(", ")}, which no import provides`);
  return table.flatMap(([from, names]) => {
    const used = names.filter((name) => uses.has(name));
    return used.length > 0 ? [importLine(used, from)] : [];
  });
}
