/** A class's features' names: as its table writes them, normalized, their ordinal variants, and where they occur. */

import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";

/** An ordinal before a feature's name: "1st Favored Enemy". */
export const ORDINAL_PREFIX = /^\d+(st|nd|rd|th)\s+/i;

/** A class feature's name without its ability type ("Rage (Ex)" → "Rage"). */
export function getFeatureBaseName(name: string): string {
  return name.replace(/\s*\((Ex|Su|Sp)\)\s*$/, "").trim();
}

/**
 * Check if a feature is a scaling ability (e.g. "Dodge bonus +1", "+2", "+3")
 * by looking at raw progression entries. If the raw entries that normalize to
 * the same name have increasing numeric suffixes, it's scaling, not a pool pick.
 */
export function isScalingFeature(normalizedName: string, progression: ClassReference["raw"]["progression"]): boolean {
  const rawEntries: string[] = [];
  for (const row of progression) {
    for (const special of row.special) {
      if (!special) continue;
      if (normalizeFeatureName(special) === normalizedName) rawEntries.push(special);
    }
  }
  if (rawEntries.length < 2) return false;

  // Check if raw entries have increasing numeric suffixes
  const numbers = rawEntries.map((e) => {
    const m = e.match(/\+(\d+)(?:d\d+)?$|\((?:\+)?(\d+)(?:d\d+)?\)$|(\d+)\/[–-]$/);
    return m ? parseInt(m[1] ?? m[2] ?? m[3], 10) : null;
  });

  if (numbers.every((n) => n !== null)) {
    // All entries have numeric suffixes — check if they increase
    for (let i = 1; i < numbers.length; i++) if (numbers[i]! <= numbers[i - 1]!) return false;

    return true;
  }
  return false;
}

/**
 * Whether an occurrence (lowercased) is a variant of the feature `name` (lowercased): its name with a suffix ("Bear
 * Form (Black)", "Remove Disease 1/Week"), or an ordinal before it ("1st Favored Enemy").
 */
export function isVariantOf(occurrence: string, name: string): boolean {
  if (occurrence.startsWith(name + " ") || occurrence.startsWith(name + "(")) return true;
  return ORDINAL_PREFIX.test(occurrence) && stripOrdinalPrefix(occurrence) === name;
}

/** Merges "1st Foo" / "2nd Foo" occurrences into one entry with combined levels. */
export function mergeOrdinalVariants(
  featureOccurrences: { levels: number[]; name: string }[],
): { levels: number[]; name: string }[] {
  const map = new Map<string, { levels: Set<number>; name: string }>();
  for (const occ of featureOccurrences) {
    const base = stripOrdinalPrefix(occ.name);
    const key = base.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      for (const l of occ.levels) existing.levels.add(l);
      if (existing.name !== base && /^\d/.test(existing.name)) existing.name = base;
    } else {
      map.set(key, { name: base, levels: new Set(occ.levels) });
    }
  }
  return Array.from(map.values()).map(({ name, levels }) => ({ name, levels: [...levels].sort((a, b) => a - b) }));
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

/** Each feature the table's Special column names, normalized, and the levels it's at. */
export function readFeatureOccurrences(
  progression: ClassReference["raw"]["progression"],
): { levels: number[]; name: string }[] {
  const map = new Map<string, number[]>();

  for (const row of progression) {
    for (const special of row.special) {
      if (!special) continue;
      // Skip dash/em-dash/replacement characters and lone quotes (means "no feature at this level")
      if (special.trim().length <= 1 || /^[\u2014\u2013\u2012\u2015\uFFFD'"-]+$/.test(special.trim())) continue;
      // Skip caster advancement entries — they're not class features
      if (special.toLowerCase().includes("+1 level of existing")) continue;
      // Skip bare "spells" entries — handled by spell config, not class features
      if (special.toLowerCase().trim() === "spells") continue;
      // Skip "Table:" entries — these are table references, not class features
      if (special.startsWith("Table:")) continue;
      const normalized = normalizeFeatureName(special);
      if (!map.has(normalized)) map.set(normalized, []);

      map.get(normalized)!.push(row.level);
    }
  }

  return Array.from(map.entries()).map(([name, levels]) => ({ name, levels }));
}

/** A feature's name without its ordinal ("1st Favored Enemy" → "Favored Enemy"). */
export function stripOrdinalPrefix(name: string): string {
  return name.replace(ORDINAL_PREFIX, "");
}
