/** An entry's name as the books write it: normalized, matched whatever its number, made an identifier or a title. */

/** The small words a title keeps lowercase, the first aside. */
const LOWERCASE_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "if",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
]);

/** An ordinal before a feature's name: "1st Favored Enemy". */
const ORDINAL_PREFIX = /^\d+(st|nd|rd|th)\s+/i;

/** A name in title case, its small words (a, an, and…) aside, a parenthesized word capitalized too ("(Planar)"). */
export function capitalizeTitle(s: string): string {
  return s
    .split(/\s+/)
    .map((w, i) => {
      const lower = w.toLowerCase();
      // Always capitalize first word
      if (i === 0) return lower.charAt(0).toUpperCase() + lower.slice(1);
      // Capitalize words starting with ( — e.g. "(Planar)"
      if (lower.startsWith("(")) return "(" + lower.charAt(1).toUpperCase() + lower.slice(2);
      // Keep articles/prepositions lowercase
      if (LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function findWithPluralVariants<V>(map: Map<string, V>, name: string): V | undefined {
  for (const v of getPluralVariants(name)) {
    const result = map.get(v);
    if (result !== undefined) return result;
  }
  return undefined;
}

/** A class feature's name without its ability type ("Rage (Ex)" → "Rage"). */
export function getFeatureBaseName(name: string): string {
  return name.replace(/\s*\((Ex|Su|Sp)\)\s*$/, "").trim();
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
 * Whether an occurrence (lowercased) is a variant of the feature `name` (lowercased): its name with a suffix ("Bear
 * Form (Black)", "Remove Disease 1/Week"), or an ordinal before it ("1st Favored Enemy").
 */
export function isVariantOf(occurrence: string, name: string): boolean {
  if (occurrence.startsWith(name + " ") || occurrence.startsWith(name + "(")) return true;
  return ORDINAL_PREFIX.test(occurrence) && stripOrdinalPrefix(occurrence) === name;
}

/** A feature's name as the table writes it, without its numbers ("Sneak attack +1d6" → "Sneak Attack"), title-cased. */
export function normalizeFeatureName(name: string): string {
  return (
    name
      // Replace replacement characters with spaces (encoding artifacts)
      .replace(/\uFFFD/g, " ")
      // Strip leading "+N " prefix (e.g. "+1 save against poison" → "Save Against Poison")
      .replace(/^\+\d+\s+/, "")
      // Strip "+Nd6" suffixes (e.g. "Sneak attack +1d6" → "Sneak Attack")
      .replace(/\s*\+\d+d\d+$/i, "")
      // Strip "+N" suffixes (e.g. "Enhance arrow +1" → "Enhance Arrow")
      .replace(/\s*\+\d+$/, "")
      // Strip "(Nd8)" etc. (e.g. "Breath weapon (2d8)")
      .replace(/\s*\(\d+d\d+\)$/i, "")
      // Strip "(+N)" suffixes (e.g. "Natural armor increase (+1)")
      .replace(/\s*\(\+\d+\)$/, "")
      // Strip "(Stat +N)" suffixes (e.g. "Ability boost (Con +2)")
      .replace(/\s*\([A-Z][a-z]+ \+\d+\)$/, "")
      // Strip "N/day" with or without parens
      .replace(/\s*\(?\d+\/day\)?$/i, "")
      // Strip "N ft." suffixes (e.g. "Shadow jump 20 ft.")
      .replace(/\s*\d+\s*ft\.?$/i, "")
      // Strip trailing ordinals (e.g. "2nd")
      .replace(/\s*\d+(st|nd|rd|th)$/i, "")
      // Strip "N/–" damage reduction values (e.g. "Damage reduction 3/–")
      .replace(/\s*\d+\/[–-]$/, "")
      .trim()
      // Title-case each word for consistent naming (but not after apostrophes)
      .replace(/(?<!['''])\b\w/g, (c) => c.toUpperCase())
  );
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

/** A feature's name without its ordinal ("1st Favored Enemy" → "Favored Enemy"). */
export function stripOrdinalPrefix(name: string): string {
  return name.replace(ORDINAL_PREFIX, "");
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
