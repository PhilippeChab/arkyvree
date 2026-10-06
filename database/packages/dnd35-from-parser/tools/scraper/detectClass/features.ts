/** Groups a class's features: their names, occurrences, sub-options and ordinal variants. */

import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/scrapedText.ts";
import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";

/**
 * Parse a combined pool feature description into individual sub-options.
 * Matches patterns like: "Name (Ex): description text" or "Name: description text"
 *
 * The intro text (before the first sub-option) is returned separately.
 */
const STACKABLE_PATTERNS = [
  /can be selected .* second time/i,
  /can be taken multiple times/i,
  /selected more than one time/i,
  /selected more than once/i,
  /can be selected more than once/i,
  /this ability can be selected more than once/i,
  /changes .* are cumulative/i,
];

/** D&D type suffixes embedded in raw class feature names, e.g. "Tattoo (Su or Sp)" */
const TYPE_SUFFIX = /\s*\((?:Ex|Su|Sp|Su or Sp)\)$/i;

export const ORDINAL_PREFIX = /^\d+(st|nd|rd|th)\s+/i;

function detectStackable(description: string): boolean {
  return STACKABLE_PATTERNS.some((p) => p.test(description));
}

/** Merges "1st Foo" / "2nd Foo" occurrences into one entry with combined levels. */
export function aggregateOrdinalVariants(
  featureOccurrences: { name: string; levels: number[] }[],
): { name: string; levels: number[] }[] {
  const map = new Map<string, { name: string; levels: Set<number> }>();
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

export function buildFeatureMap<T>(
  features: ClassReference["raw"]["classFeatures"],
  valueFn: (cf: ClassReference["raw"]["classFeatures"][number]) => T,
): Map<string, T> {
  const map = new Map<string, T>();
  for (const cf of features) {
    map.set(cf.name.toLowerCase(), valueFn(cf));
    const stripped = cf.name.replace(TYPE_SUFFIX, "").toLowerCase();
    if (stripped !== cf.name.toLowerCase()) {
      map.set(stripped, valueFn(cf));
    }
  }
  return map;
}

export function detectFeatureOccurrences(
  progression: ClassReference["raw"]["progression"],
): { name: string; levels: number[] }[] {
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
      if (!map.has(normalized)) {
        map.set(normalized, []);
      }
      map.get(normalized)!.push(row.level);
    }
  }

  return Array.from(map.entries()).map(([name, levels]) => ({ name, levels }));
}

/** A class feature's name without its ability type ("Rage (Ex)" → "Rage"). */
export function featureBaseName(name: string): string {
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
      if (normalizeFeatureName(special) === normalizedName) {
        rawEntries.push(special);
      }
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
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i]! <= numbers[i - 1]!) return false;
    }
    return true;
  }
  return false;
}

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

export function parsePoolSubOptions(
  description: string,
): { intro: string; options: { name: string; description: string; stackable?: true }[] } | undefined {
  // Match "Name (Ex/Su/Sp):" or "Name:" where Name is title-cased words (may include hyphens, apostrophes)
  const pattern = /(?:^|\.\s+)([A-Z][A-Za-z'-]+(?:\s+[A-Za-z'-]+)*)\s*(?:\((?:Ex|Su|Sp)\)\s*)?:\s*/g;
  const matches: { name: string; index: number; matchLength: number }[] = [];

  let m;
  while ((m = pattern.exec(description)) !== null) {
    matches.push({ name: m[1], index: m.index, matchLength: m[0].length });
  }

  if (matches.length < 2) return undefined;

  // Extract intro (text before first match)
  const introEnd = matches[0].index;
  const intro = description
    .slice(0, introEnd)
    .replace(/\.\s*$/, "")
    .trim();

  const options: { name: string; description: string; stackable?: true }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].matchLength;
    const end = i + 1 < matches.length ? matches[i + 1].index : description.length;
    const desc = normalizeWs(description.slice(start, end).replace(/\.\s*$/, ""));
    options.push({ name: matches[i].name, description: desc, ...(detectStackable(desc) ? { stackable: true } : {}) });
  }

  return { intro, options };
}

export function stripOrdinalPrefix(name: string): string {
  return name.replace(ORDINAL_PREFIX, "");
}
