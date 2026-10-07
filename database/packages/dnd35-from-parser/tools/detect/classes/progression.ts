/**
 * Detects what a class's table gives: its BAB, saves, hit die and skill points, spells per day and known, and caster
 * level advancement.
 */

import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { BabType, SaveType } from "@/database/packages/dnd35/content/classes/types.ts";

function detectSave(
  progression: ClassReference["raw"]["progression"],
  key: "fortSave" | "refSave" | "willSave",
): SaveType {
  const last = progression[progression.length - 1];
  const level = last.level;
  if (last[key] === goodSave(level)) return "good";
  return "poor";
}

function goodSave(level: number): number {
  return Math.floor(level / 2) + 2;
}

function parseSpellSlotString(s: string): number[] {
  return s
    .split(",")
    .map((v) => {
      const cleaned = v.trim();
      if (cleaned === "—" || cleaned === "-" || cleaned === "") return -1;
      return parseInt(cleaned, 10);
    })
    .filter((n) => n >= 0);
}

export function detectBab(progression: ClassReference["raw"]["progression"]): BabType {
  for (const row of progression) {
    const { level, bab } = row;
    if (bab === level) continue;
    if (bab === Math.floor((level * 3) / 4)) continue;
    if (bab === Math.floor(level / 2)) continue;
  }
  // Check from last level for most reliable detection
  const last = progression[progression.length - 1];
  if (last.bab === last.level) return "good";
  if (last.bab === Math.floor((last.level * 3) / 4)) return "medium";
  return "poor";
}

export function detectCasterAdvancement(
  progression: ClassReference["raw"]["progression"],
): ClassReference["detected"]["casterLevelAdvancement"] | undefined {
  const levels: number[] = [];
  let hasArcane = false;
  let hasDivine = false;

  for (const row of progression) {
    // Check both spellsPerDay column and Special column for advancement text
    const textsToCheck = [row.spellsPerDay, ...row.special].filter(Boolean);

    for (const text of textsToCheck) {
      const lower = text!.toLowerCase();
      if (lower.includes("+1 level of existing") || lower.includes("+1 level of")) {
        levels.push(row.level);

        if (lower.includes("arcane")) hasArcane = true;
        if (lower.includes("divine")) hasDivine = true;
        break; // Only count once per level
      }
    }
  }

  if (levels.length === 0) return undefined;

  let type: "divine" | "arcane" | "any" | "dual";
  if (hasArcane && hasDivine) type = "dual"; // Both arcane+divine (e.g. Mystic Theurge)
  else if (hasArcane) type = "arcane";
  else if (hasDivine) type = "divine";
  else type = "any"; // Generic "+1 level of existing spellcasting class"

  return { type, levels };
}

export function detectCasterType(raw: ClassReference["raw"]): { casterType?: "Arcane" | "Divine" } {
  const text = raw.classFeatures.map((f) => f.description).join(" ");
  if (/casts?\b.{0,30}\barcane spells/i.test(text) || /arcane spell failure/i.test(text))
    return { casterType: "Arcane" };
  if (/casts?\b.{0,30}\bdivine spells/i.test(text) || /\bdivine focus\b/i.test(text)) return { casterType: "Divine" };
  return {};
}

export function detectSaves(progression: ClassReference["raw"]["progression"]): {
  fortitude: SaveType;
  reflex: SaveType;
  will: SaveType;
} {
  return {
    fortitude: detectSave(progression, "fortSave"),
    reflex: detectSave(progression, "refSave"),
    will: detectSave(progression, "willSave"),
  };
}

export function detectSpellsKnown(raw: ClassReference["raw"]): number[][] | undefined {
  if (!raw.spellsKnown || raw.spellsKnown.length === 0) return undefined;
  const result: number[][] = [];
  let hasAny = false;
  for (const row of raw.spellsKnown) {
    const slots = parseSpellSlotString(row);
    // Push empty row for all-dash entries to keep level-indexed alignment with perDay
    result.push(slots);
    if (slots.length > 0) hasAny = true;
  }
  return hasAny ? result : undefined;
}

export function detectSpellsPerDay(progression: ClassReference["raw"]["progression"]): number[][] | undefined {
  const result: number[][] = [];
  let hasAny = false;
  for (const row of progression) {
    if (!row.spellsPerDay || row.spellsPerDay.toLowerCase().includes("+1 level")) {
      // No spells at this level — push empty row to keep level-indexed alignment
      result.push([]);
      continue;
    }
    const slots = parseSpellSlotString(row.spellsPerDay);
    result.push(slots);
    if (slots.length > 0) hasAny = true;
  }
  return hasAny ? result : undefined;
}

export function parseHd(hitDie: string): number {
  const match = hitDie.match(/d(\d+)/);
  return match ? parseInt(match[1], 10) : 8;
}

export function parseSkillPoints(text: string): number {
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 2;
}
