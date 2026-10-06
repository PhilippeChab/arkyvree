/** An entry's name as the books write it: normalized, matched whatever its number, and made an identifier. */

export function lookupWithPluralVariants<V>(map: Map<string, V>, name: string): V | undefined {
  for (const v of pluralVariants(name)) {
    const result = map.get(v);
    if (result !== undefined) return result;
  }
  return undefined;
}

export function matchesWithPluralVariants(a: string, b: string): boolean {
  return pluralVariants(a).includes(b.toLowerCase());
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

export function pluralVariants(name: string): string[] {
  const n = name.toLowerCase();
  return [n, n + "s", n.replace(/y$/, "ies"), n.replace(/ies$/, "y"), n.replace(/s$/, "")];
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
