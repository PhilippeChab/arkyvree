/** A spell reference's seeds: its PowerSeed[], each with its level. */

import {
  getInheritedLevel,
  getInheritedLists,
} from "@/database/packages/dnd35-from-parser/tools/buildSeeds/classes.ts";
import ClassSpellMaps from "@/database/packages/dnd35-from-parser/tools/buildSeeds/ClassSpellMaps.ts";
import { listReferenceBooks } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import { sanitizeText } from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";
import { normalizeDescription, normalizeWs } from "@/database/packages/dnd35-from-parser/tools/scrapedText.ts";
import { type SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
import type { PowerSeed } from "@/database/packages/dnd35/content/spells/types.ts";
import {
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_TARGET,
} from "@/shared/dnd3.5/properties/index.ts";
import { capitalize } from "@/shared/text.ts";

/** A spell of a reference, as scraped. */
type RawSpell = SpellReference["raw"][number];

export type SpellSeedWithLevel = PowerSeed & { level: number };

const COMPONENT_MAP: Record<string, string> = {
  V: "Verbal",
  S: "Somatic",
  M: "Material",
  F: "Focus",
  DF: "Divine Focus",
  XP: "XP Cost",
};

/** Compound component forms used in manual seeds: "M/DF" → "Material/Divine Focus" */
const COMPOUND_COMPONENT_MAP: Record<string, string> = {
  "M/DF": "Material/Divine Focus",
  "F/DF": "Focus/Divine Focus",
};

const SUBSCHOOL_CANON: Record<string, string> = Object.fromEntries(
  [
    "Calling",
    "Charm",
    "Compulsion",
    "Creation",
    "Figment",
    "Glamer",
    "Healing",
    "Pattern",
    "Phantasm",
    "Polymorph",
    "Scrying",
    "Shadow",
    "Summoning",
    "Teleportation",
  ].map((s) => [s.toLowerCase(), s]),
);

function expandComponents(components: string[]): string[] {
  const result: string[] = [];
  for (const comp of components) {
    const compound = COMPOUND_COMPONENT_MAP[comp.trim()];
    if (compound) {
      if (!result.includes(compound)) result.push(compound);
      continue;
    }
    const mapped = COMPONENT_MAP[comp.trim()];
    if (mapped && !result.includes(mapped)) result.push(mapped);
  }
  return result;
}

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

function normalizeDescriptor(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  // Only normalize all-lowercase scrapes (e.g. "good"); leave mixed-case
  // compounds like "Fire or Cold" or "Mind-Affecting" untouched.
  if (trimmed !== trimmed.toLowerCase()) return trimmed;
  return trimmed.split("-").map(capitalize).join("-");
}

function normalizeSpellResistance(value: string): string {
  // Lowercase the canonical "(harmless)" / "(harmless, object)" parenthetical
  return value.replace(/\(Harmless/g, "(harmless");
}

/** Collapse whitespace/newlines and normalize spell stat text */
function normalizeSpellText(text: string): string {
  return normalizeWs(sanitizeText(text)).replace(/(\d+)\s*\/\s*/g, "$1/"); // "1 round/ level" → "1 round/level"
}

function normalizeSubschool(value: string): string {
  // "divination (scrying)" → "Scrying"; "teleportation" → "Teleportation"
  const parenMatch = value.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inner = parenMatch[1].trim().toLowerCase();
    if (SUBSCHOOL_CANON[inner]) return SUBSCHOOL_CANON[inner];
  }
  const lower = value.trim().toLowerCase();
  return SUBSCHOOL_CANON[lower] ?? value;
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

function simplifyRange(range: string): string {
  // Strip leaked "Area/Effect/Target:" labels from upstream parser glitches
  // (e.g. "Touch Area/Effect/Target: Animal touched" → "Touch")
  const stripped = range.replace(/\s+(Area|Effect|Target)\/.*$/i, "").trim();
  if (stripped.startsWith("Close")) return "Close";
  if (stripped.startsWith("Medium")) return "Medium";
  if (stripped.startsWith("Long")) return "Long";
  return stripped;
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

/** A spell's properties: its school, subschool and descriptors, casting time, range, targets, duration, components. */
function spellProperties(entry: RawSpell): { type: string; value: string }[] {
  const properties: { type: string; value: string }[] = [];
  properties.push({ type: SPELL_SCHOOL, value: entry.school });
  if (entry.subschool) properties.push({ type: SPELL_SUBSCHOOL, value: normalizeSubschool(entry.subschool) });
  for (const desc of entry.descriptors) {
    properties.push({ type: SPELL_DESCRIPTOR, value: normalizeDescriptor(desc) });
  }
  properties.push({
    type: SPELL_CASTING_TIME,
    value: normalizeSpellText(entry.castingTime || "1 standard action"),
  });
  const rangeValue = simplifyRange(normalizeSpellText(entry.range));
  if (rangeValue) properties.push({ type: SPELL_RANGE_TYPE, value: rangeValue });
  const targetValue = entry.target ? normalizeSpellText(entry.target) : undefined;
  if (targetValue) properties.push({ type: SPELL_TARGET, value: targetValue });
  if (entry.area) properties.push({ type: SPELL_AREA_OF_EFFECT, value: normalizeSpellText(entry.area) });
  const effectValue = entry.effect ? normalizeSpellText(entry.effect) : undefined;
  if (effectValue && effectValue !== targetValue) properties.push({ type: SPELL_TARGET, value: effectValue });
  properties.push({ type: SPELL_DURATION, value: normalizeSpellText(entry.duration) });
  properties.push({
    type: SPELL_RESISTANCE,
    value: normalizeSpellResistance(normalizeSpellText(entry.spellResistance || "No")),
  });
  for (const compName of expandComponents(entry.components)) {
    properties.push({ type: SPELL_COMPONENT, value: compName });
  }
  return properties;
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
    const properties = spellProperties(entry);

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
