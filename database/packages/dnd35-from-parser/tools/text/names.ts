/** An entry's name as the books write it: normalized, matched whatever its number, and made an identifier. */

export function findWithPluralVariants<V>(map: Map<string, V>, name: string): V | undefined {
  for (const v of getPluralVariants(name)) {
    const result = map.get(v);
    if (result !== undefined) return result;
  }
  return undefined;
}

export function getPluralVariants(name: string): string[] {
  const n = name.toLowerCase();
  return [n, n + "s", n.replace(/y$/, "ies"), n.replace(/ies$/, "y"), n.replace(/s$/, "")];
}

/** Insert an ordinal suffix before the parenthetical class suffix in a feat name. */
export function insertOrdinalInName(name: string, ordinal: string): string {
  const match = name.match(/^(.+?)(\s*\(.+\))$/);
  if (match) return `${match[1]} ${ordinal}${match[2]}`;
  return `${name} ${ordinal}`;
}

/** Whether `variant` is one of `name`'s forms, singular or plural ("Bonus Feats" of "bonus feat"). */
export function isPluralVariantOf(variant: string, name: string): boolean {
  return getPluralVariants(name).includes(variant.toLowerCase());
}

/**
 * Capitalize the first letter of each word inside parentheses.
 * e.g. "Armor Proficiency (heavy)" → "Armor Proficiency (Heavy)"
 */
export function normalizeName(name: string): string {
  return name.replace(/\(([^)]+)\)/g, (_, inner: string) => {
    const capitalized = inner.replace(/\b[a-z]/g, (c) => c.toUpperCase());
    return `(${capitalized})`;
  });
}

/** Strip class suffix: "Track (Ranger)" → "Track" */
export function stripClassSuffix(name: string, className: string): string | undefined {
  const suffix = ` (${className})`;
  if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  return undefined;
}

export function toCamelCase(name: string): string {
  return name
    .replace(/['']/g, "")
    .split(/[\s-]+/)
    .map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join("");
}

/** A name as a constant's: "Arcane Archer" → "ARCANE_ARCHER". */
export function toConstName(name: string): string {
  return name
    .replace(/[()'']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}
