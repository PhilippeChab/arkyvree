/**
 * What a class's table gives: its BAB, saves, hit die and skill points, spells per day and known, and caster
 * level advancement.
 */

import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { BabType, SaveType } from "@/database/packages/dnd35/content/classes/types.ts";

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

/** A save's progression, by its last level's. */
function saveProgression(
  progression: ClassReference["raw"]["progression"],
  key: "fortSave" | "refSave" | "willSave",
): SaveType {
  const last = progression[progression.length - 1];
  const level = last.level;
  if (last[key] === goodSave(level)) return "good";
  return "poor";
}

/** The class's base attack bonus progression, by its last level's: good (its level), medium (¾ of it) or poor. */
export function readBab(progression: ClassReference["raw"]["progression"]): BabType {
  const last = progression[progression.length - 1];
  if (last.bab === last.level) return "good";
  if (last.bab === Math.floor((last.level * 3) / 4)) return "medium";
  return "poor";
}

/** The levels that advance an existing spellcasting class ("+1 level of existing arcane class"), and its kind. */
export function readCasterAdvancement(
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

/** The kind of spells the class casts, as its features' text says. */
export function readCasterType(raw: ClassReference["raw"]): { casterType?: "Arcane" | "Divine" } {
  const text = raw.classFeatures.map((f) => f.description).join(" ");
  if (/casts?\b.{0,30}\barcane spells/i.test(text) || /arcane spell failure/i.test(text))
    return { casterType: "Arcane" };
  if (/casts?\b.{0,30}\bdivine spells/i.test(text) || /\bdivine focus\b/i.test(text)) return { casterType: "Divine" };
  return {};
}

/** The class's hit die ("d10" → 10), d8 when it gives none. */
export function readHitDie(hitDie: string): number {
  const match = hitDie.match(/d(\d+)/);
  return match ? parseInt(match[1], 10) : 8;
}

/** Each save's progression, by its last level's: good or poor. */
export function readSaves(progression: ClassReference["raw"]["progression"]): {
  fortitude: SaveType;
  reflex: SaveType;
  will: SaveType;
} {
  return {
    fortitude: saveProgression(progression, "fortSave"),
    reflex: saveProgression(progression, "refSave"),
    will: saveProgression(progression, "willSave"),
  };
}

/** The class's skill points per level, 2 when it gives none. */
export function readSkillPoints(text: string): number {
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 2;
}

/** The spells known table, a row per level: none when it has no number. */
export function readSpellsKnown(raw: ClassReference["raw"]): number[][] | undefined {
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

/** The spells per day the table gives, a row per level: none when it gives none. */
export function readSpellsPerDay(progression: ClassReference["raw"]["progression"]): number[][] | undefined {
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
