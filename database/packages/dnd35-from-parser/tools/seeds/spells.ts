/** A spell reference's seeds: its PowerSeed[], each with its level. */

import { normalizeDescription } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import type { InheritedSpellList } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { type SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
import type { SpellSeed } from "@/database/packages/dnd35/content/spells/types.ts";

import { getInheritedLevel } from "./inheritedLists.ts";

/** A spell of a reference, as scraped. */
type RawSpell = SpellReference["raw"][number];

/**
 * A spell's aptitudes (its classes' spell lists, by the name its level line gives each, `classSpellLists`, and the
 * lists other books' classes inherit, `othersInherited`), its level on each, and its lowest level: on a list it's on,
 * else in any level entry, else 0. Its level entries are the scraped ones: an override's extra entries reach only the
 * copies an extension makes of a core spell (#359).
 */
function spellLevels(
  entry: RawSpell,
  othersInherited: { aptitude: string; list: InheritedSpellList }[],
  classSpellLists: Record<string, string>,
) {
  const aptitudes = new Set<string>();
  const aptitudeLevels: Record<string, number> = {};
  let minLevel = 99;

  for (const le of entry.levelEntries) {
    const apt = classSpellLists[le.className];
    if (apt) {
      aptitudes.add(apt);
      aptitudeLevels[apt] = aptitudeLevels[apt] !== undefined ? Math.min(aptitudeLevels[apt], le.level) : le.level;
      minLevel = Math.min(minLevel, le.level);
    }
  }

  for (const { aptitude, list } of othersInherited) {
    if (aptitudes.has(aptitude)) continue;
    const level = getInheritedLevel(entry, entry.levelEntries, list);
    if (level === undefined) continue;
    aptitudes.add(aptitude);
    aptitudeLevels[aptitude] = level;
  }

  // Fallback: if no mapped entries found, use the lowest level from any entry
  if (minLevel === 99) for (const le of entry.levelEntries) minLevel = Math.min(minLevel, le.level);

  if (minLevel === 99) minLevel = 0;
  return { aptitudes, aptitudeLevels, minLevel };
}

/**
 * A spell reference's seeds, sorted by level, then name: each on its classes' lists (`classSpellLists`) and the lists
 * other books' classes draw on others' for (`othersInherited`).
 */
export function buildSpellSeeds(
  ref: SpellReference,
  othersInherited: { aptitude: string; list: InheritedSpellList }[],
  classSpellLists: Record<string, string>,
): SpellSeed[] {
  const spells: SpellSeed[] = [];

  for (const entry of ref.raw) {
    const { aptitudes, aptitudeLevels, minLevel } = spellLevels(entry, othersInherited, classSpellLists);
    const { properties, savingThrow } = ref.detected[entry.name];
    // Only include aptitudeLevels when not all aptitudes share the same level
    const hasVaryingLevels = Object.values(aptitudeLevels).some((l) => l !== minLevel);
    const seed: SpellSeed = {
      name: entry.name,
      description: normalizeDescription(ref.mapping[entry.name].description),
      aptitudes: [...aptitudes].sort(),
      ...(hasVaryingLevels ? { aptitudeLevels } : {}),
      savingThrow,
      properties,
      level: minLevel,
    };

    spells.push(seed);
  }

  // Sort by level, then name
  spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  return spells;
}
