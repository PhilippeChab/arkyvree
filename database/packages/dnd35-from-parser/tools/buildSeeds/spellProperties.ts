/** A spell's properties (school, descriptors, casting time, range, components…), its text written as the seed stores it. */

import { sanitizeText } from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";
import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/scrapedText.ts";
import type { SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
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

function simplifyRange(range: string): string {
  // Strip leaked "Area/Effect/Target:" labels from upstream parser glitches
  // (e.g. "Touch Area/Effect/Target: Animal touched" → "Touch")
  const stripped = range.replace(/\s+(Area|Effect|Target)\/.*$/i, "").trim();
  if (stripped.startsWith("Close")) return "Close";
  if (stripped.startsWith("Medium")) return "Medium";
  if (stripped.startsWith("Long")) return "Long";
  return stripped;
}

/** A spell's properties: its school, subschool and descriptors, casting time, range, targets, duration, components. */
export function buildSpellProperties(entry: SpellReference["raw"][number]): { type: string; value: string }[] {
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

/** Collapse whitespace/newlines and normalize spell stat text */
export function normalizeSpellText(text: string): string {
  return normalizeWs(sanitizeText(text)).replace(/(\d+)\s*\/\s*/g, "$1/"); // "1 round/ level" → "1 round/level"
}
