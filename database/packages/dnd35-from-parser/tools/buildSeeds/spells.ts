import ClassSpellMaps from "@/database/packages/dnd35-from-parser/tools/buildSeeds/ClassSpellMaps.ts";
import {
  getInheritedLevel,
  getInheritedLists,
} from "@/database/packages/dnd35-from-parser/tools/buildSeeds/inheritedLists.ts";
import {
  buildSpellProperties,
  normalizeSpellText,
} from "@/database/packages/dnd35-from-parser/tools/buildSeeds/spellProperties.ts";
import { listReferenceBooks } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import { normalizeDescription } from "@/database/packages/dnd35-from-parser/tools/scrapedText.ts";
import { type SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
import type { PowerSeed } from "@/database/packages/dnd35/content/spells/types.ts";

/** A spell of a reference, as scraped. */
type RawSpell = SpellReference["raw"][number];

export type SpellSeedWithLevel = PowerSeed & { level: number };

/** Whether a spell lacks a field its base spell can give it ("functions like" another). */
function lacksFields(entry: RawSpell): boolean {
  return (
    !entry.range ||
    !entry.duration ||
    entry.components.length === 0 ||
    !entry.savingThrow ||
    !entry.spellResistance ||
    !entry.castingTime
  );
}

/**
 * Resolve a "functions like" base spell reference to a raw entry, of the reference's (`rawByName`, by lowercased name).
 * Handles patterns: "interposing hand" → "Bigby's Interposing Hand",
 * "mass cure light wounds" → "Cure Light Wounds, Mass", etc.
 */
function resolveBaseSpell(rawByName: Map<string, RawSpell>, refText: string): RawSpell | undefined {
  const lower = refText.toLowerCase();
  // Direct match
  if (rawByName.has(lower)) return rawByName.get(lower);
  // "mass X" → "X, Mass"
  const massMatch = lower.match(/^(greater|lesser|mass)\s+(.+)$/);
  if (massMatch) {
    const reordered = `${massMatch[2]}, ${massMatch[1]}`;
    if (rawByName.has(reordered)) return rawByName.get(reordered);
  }
  // Partial match: "interposing hand" should match "Bigby's Interposing Hand"
  for (const [name, entry] of rawByName) {
    if (name.endsWith(lower) || name.endsWith(` ${lower}`)) return entry;
  }
  return undefined;
}

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
  if (minLevel === 99) {
    for (const le of entry.levelEntries) {
      minLevel = Math.min(minLevel, le.level);
    }
  }
  if (minLevel === 99) minLevel = 0;
  return { aptitudes, aptitudeLevels, minLevel };
}

/**
 * A spell with the fields it lacks taken from its base spell (SRD "functions like X" pattern), of the reference's
 * (`rawByName`). Follows the chain: e.g. Mass Charm Monster → Charm Monster → Charm Person.
 */
function withBaseSpellFields(rawEntry: RawSpell, rawByName: Map<string, RawSpell>): RawSpell {
  let entry = rawEntry;
  if (!lacksFields(entry)) return entry;
  // Walk the "functions like" chain up to 3 levels deep
  let current: RawSpell | undefined = entry;
  const visited = new Set<string>([entry.name]);
  for (let depth = 0; depth < 3 && current; depth++) {
    const baseMatch = current.description.match(
      /(?:functions? like|works like|functions? similarly to|[Ss]imilar to)\s+(.+?)(?:,|\.| except| but)/i,
    );
    if (!baseMatch) break;
    const baseRef = baseMatch[1].trim().replace(/^a /i, "").replace(/\.$/, "");
    const base = resolveBaseSpell(rawByName, baseRef);
    if (!base || visited.has(base.name)) break;
    visited.add(base.name);

    entry = {
      ...entry,
      castingTime: entry.castingTime || base.castingTime,
      range: entry.range || base.range,
      duration: entry.duration || base.duration,
      components: entry.components.length > 0 ? entry.components : base.components,
      // Only inherit target/area/effect if this spell has none at all
      ...(!entry.target && !entry.effect && !entry.area
        ? {
            target: base.target,
            effect: base.effect,
            area: base.area,
          }
        : {}),
      // Only inherit savingThrow/spellResistance if truly empty (not scraped)
      savingThrow: entry.savingThrow || base.savingThrow,
      spellResistance: entry.spellResistance || base.spellResistance,
    };
    // Continue walking if still missing fields
    if (!lacksFields(entry)) break;
    current = base;
  }
  return entry;
}

export function buildSpellSeeds(ref: SpellReference, book?: string): { spells: SpellSeedWithLevel[] } {
  // The lists other books' classes draw on others' lists for (`inheritsFrom`), which an extension's spell can be on:
  // the book seeds its own copy of each that takes one, which a ruleset merges with that book's when it takes both, as
  // it does a class list the spell's level line names. The core rules' spells reach them through each book's copies.
  const othersInherited =
    book && book !== "srd"
      ? listReferenceBooks().flatMap((other) => (other === book ? [] : getInheritedLists(other)))
      : [];

  // Build name lookup (case-insensitive) for base spell resolution
  const rawByName = new Map<string, RawSpell>();
  for (const entry of ref.raw) {
    rawByName.set(entry.name.toLowerCase(), entry);
  }

  const spells: SpellSeedWithLevel[] = [];

  for (const rawEntry of ref.raw) {
    const entry = withBaseSpellFields(rawEntry, rawByName);
    const { aptitudes, aptitudeLevels, minLevel } = spellLevels(entry, othersInherited);
    const properties = buildSpellProperties(entry);

    const savingThrow = normalizeSpellText(entry.savingThrow || "None");
    // Only include aptitudeLevels when not all aptitudes share the same level
    const hasVaryingLevels = Object.values(aptitudeLevels).some((l) => l !== minLevel);
    const seed: SpellSeedWithLevel = {
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
