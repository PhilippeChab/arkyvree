/** A spell reference's seeds: its PowerSeed[], each with its level. */

import { CORE_BOOK, listReferenceBooks } from "@/database/packages/dnd35-from-parser/tools/references/files.ts";
import { normalizeDescription } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import { type SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
import type { SpellSeed } from "@/database/packages/dnd35/content/spells/types.ts";

import ClassSpellMaps from "./ClassSpellMaps.ts";
import { getInheritedLevel, getInheritedLists } from "./inheritedLists.ts";

/** A spell of a reference, as scraped. */
type RawSpell = SpellReference["raw"][number];

/**
 * A spell's aptitudes (its classes' spell lists, and the lists of other books' classes inherit, `othersInherited`), its
 * level on each, and its lowest level: on a list it's on, else in any level entry, else 0.
 */
function spellLevels(entry: RawSpell, othersInherited: ReturnType<typeof getInheritedLists>) {
  const aptitudes = new Set<string>();
  const aptitudeLevels: Record<string, number> = {};
  let minLevel = 99;

  const classAbbrevMap = ClassSpellMaps.abbreviations();
  const dualClassMap = ClassSpellMaps.duals();
  for (const le of entry.levelEntries) {
    const dual = dualClassMap[le.className];
    if (dual) {
      for (const a of dual) {
        aptitudes.add(a);
        aptitudeLevels[a] = aptitudeLevels[a] !== undefined ? Math.min(aptitudeLevels[a], le.level) : le.level;
      }
      minLevel = Math.min(minLevel, le.level);
    } else {
      const apt = classAbbrevMap[le.className];
      if (apt) {
        aptitudes.add(apt);
        aptitudeLevels[apt] = aptitudeLevels[apt] !== undefined ? Math.min(aptitudeLevels[apt], le.level) : le.level;
        minLevel = Math.min(minLevel, le.level);
      }
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

export function buildSpellSeeds(ref: SpellReference, book?: string): { spells: SpellSeed[] } {
  // The lists other books' classes draw on others' lists for (`inheritsFrom`), which an extension's spell can be on:
  // the book seeds its own copy of each that takes one, which a ruleset merges with that book's when it takes both, as
  // it does a class list the spell's level line names. The core rules' spells reach them through each book's copies.
  const othersInherited =
    book && book !== CORE_BOOK
      ? listReferenceBooks().flatMap((other) => (other === book ? [] : getInheritedLists(other)))
      : [];

  const spells: SpellSeed[] = [];

  for (const entry of ref.raw) {
    const { aptitudes, aptitudeLevels, minLevel } = spellLevels(entry, othersInherited);
    const { properties, savingThrow } = ref.detected[entry.name];
    // Only include aptitudeLevels when not all aptitudes share the same level
    const hasVaryingLevels = Object.values(aptitudeLevels).some((l) => l !== minLevel);
    const seed: SpellSeed = {
      name: entry.name,
      description: normalizeDescription(ref.overrides?.[entry.name]?.description ?? entry.description),
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

  return { spells };
}
