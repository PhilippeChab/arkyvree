/** Detects a class's bonus feat lists: the existing feats its player picks from. */

import { findWithPluralVariants } from "@/database/packages/dnd35-from-parser/tools/names.ts";
import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/scrapedText.ts";
import { parseTreatedAsHavingFeats } from "@/database/packages/dnd35-from-parser/tools/scraper/detectClass/aptitudePicks.ts";
import {
  buildFeatureMap,
  parsePoolSubOptions,
} from "@/database/packages/dnd35-from-parser/tools/scraper/detectClass/features.ts";
import { type BonusFeatList, type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";

/** A bonus feat list: "from the following list: Feat1, Feat2, ...". */
function parseBonusFeatList(description: string): string[] | undefined {
  // Match patterns like "from the following list: X, Y, Z" or "choose one feat from the following list: X, Y, Z"
  const match = description.match(/(?:from the following list|from the following feats)[:\s]+(.+?)(?:\.\s|$)/i);
  if (!match) return undefined;

  const listText = match[1];
  // Split on commas, handling parenthetical qualifiers like "Spell Focus (enchantment, necromancy, or transmutation only)"
  const feats: string[] = [];
  let current = "";
  let parenDepth = 0;
  for (const char of listText) {
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth--;
    else if (char === "," && parenDepth === 0) {
      const cleaned = current.replace(/^\s*(?:and|or)\s+/i, "").trim();
      if (cleaned) feats.push(cleaned);
      current = "";
      continue;
    }
    current += char;
  }
  // Last item (may have trailing period or "and" prefix)
  const last = current
    .replace(/^\s*(?:and|or)\s+/i, "")
    .replace(/\.\s*$/, "")
    .trim();
  if (last) feats.push(last);

  return feats.length >= 2 ? feats : undefined;
}

/** Parse per-level bonus feat choices from description like:
 *  "At 1st level... select either X or Y. At 2nd level... select either A or B."
 *  Returns an array of { level, feats } entries, or undefined if no per-level pattern found. */
function parsePerLevelBonusFeatList(description: string): { level: number; feats: string[] }[] | undefined {
  // Match "At Xth level" followed by feat choices, capturing up to the next period
  const pattern = /At (\d+)(?:st|nd|rd|th) level[^.]*?(?:select|choose)\s+(?:either\s+)?(.+?)\./gi;
  const results: { level: number; feats: string[] }[] = [];

  let m;
  while ((m = pattern.exec(description)) !== null) {
    const level = parseInt(m[1], 10);
    // Strip trailing "as a bonus feat" and similar
    const featText = m[2].replace(/\s+as a bonus feat\s*/i, "").trim();
    // Split on " or " and ", " — handles "X or Y" and "X, Y, or Z"
    const feats = featText
      .split(/,\s*(?:or\s+)?|\s+or\s+/i)
      .map((f) => f.replace(/^\s*(?:and|or)\s+/i, "").trim())
      .filter(Boolean);
    if (feats.length >= 2) {
      results.push({ level, feats });
    }
  }

  return results.length > 0 ? results : undefined;
}

export function detectBonusFeatLists(
  raw: ClassReference["raw"],
  featureOccurrences: { name: string; levels: number[] }[],
): { bonusFeatLists?: BonusFeatList[] } {
  const lists: BonusFeatList[] = [];

  const descMap = buildFeatureMap(raw.classFeatures, (cf) => cf);

  for (const occ of featureOccurrences) {
    const cf = findWithPluralVariants(descMap, occ.name);
    if (!cf) continue;

    const desc = normalizeWs(cf.description);

    // Single-level features: check for "treated as having" pattern (ranger combat style)
    if (occ.levels.length === 1) {
      const treatedFeats = parseTreatedAsHavingFeats(desc);
      if (!treatedFeats) continue;
      const ordinal =
        occ.levels[0] === 1 ? "1st" : occ.levels[0] === 2 ? "2nd" : occ.levels[0] === 3 ? "3rd" : `${occ.levels[0]}th`;
      lists.push({ aptitude: `${raw.name} ${occ.name} (${ordinal})`, feats: treatedFeats, levels: [occ.levels[0]] });
      continue;
    }

    // Don't flag features that are pool sub-options (those have "Name: description" patterns)
    const parsed = parsePoolSubOptions(desc);
    if (parsed && parsed.options.length >= 2) continue;

    // Try per-level parsing first (e.g. "At 1st level... select X or Y. At 2nd level... select A or B")
    const perLevel = parsePerLevelBonusFeatList(desc);
    if (perLevel) {
      const baseAptitude = `${raw.name} ${occ.name}`;
      for (const entry of perLevel) {
        const ordinal =
          entry.level === 1 ? "1st" : entry.level === 2 ? "2nd" : entry.level === 3 ? "3rd" : `${entry.level}th`;
        lists.push({ aptitude: `${baseAptitude} (${ordinal})`, feats: entry.feats, levels: [entry.level] });
      }
      continue;
    }

    // Fall back to shared pool parsing ("from the following list: X, Y, Z")
    const feats = parseBonusFeatList(desc);
    if (!feats) continue;

    const aptitude = `${raw.name} ${occ.name}`;
    lists.push({ aptitude, feats });
  }

  return lists.length > 0 ? { bonusFeatLists: lists } : {};
}
