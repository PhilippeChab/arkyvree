/** A class's table: its advancement's rows (its base attack bonus, saves, spells per day, special features) and its spells known. */

import { normalizeFeatureName } from "@/codegen/dnd3.5/tools/text/names.ts";
import type { ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";
import type { BabType, SaveType } from "@/content/dnd3.5/builders/classes/types.ts";

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

/**
 * A class's table, read: its base attack bonus and saves' progressions, its spells per day and known, the levels that
 * advance another class's spellcasting, and the features its Special column names (and which of them scale).
 */
export class ClassTable {
  constructor(raw: Pick<ClassReference["raw"], "progression" | "spellsKnown">) {
    this.progression = raw.progression;
    this.spellsKnownRows = raw.spellsKnown;
  }

  /** The advancement's rows, a level each. */
  private readonly progression: ClassReference["raw"]["progression"];
  /** The spells known table's rows, a level each, as scraped. */
  private readonly spellsKnownRows: ClassReference["raw"]["spellsKnown"];

  /** The class's base attack bonus progression, by its last level's: good (its level), medium (¾ of it) or poor. */
  bab(): BabType {
    const last = this.progression[this.progression.length - 1];
    if (last.bab === last.level) return "good";
    if (last.bab === Math.floor((last.level * 3) / 4)) return "medium";
    return "poor";
  }

  /** The levels that advance an existing spellcasting class ("+1 level of existing arcane class"), and its kind. */
  casterAdvancement(): ClassReference["detected"]["casterLevelAdvancement"] | undefined {
    const levels: number[] = [];
    let hasArcane = false;
    let hasDivine = false;

    for (const row of this.progression) {
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

  /** Each feature the table's Special column names, normalized, and the levels it's at. */
  featureOccurrences(): { levels: number[]; name: string }[] {
    const map = new Map<string, number[]>();

    for (const row of this.progression) {
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

  /**
   * Check if a feature is a scaling ability (e.g. "Dodge bonus +1", "+2", "+3")
   * by looking at raw progression entries. If the raw entries that normalize to
   * the same name have increasing numeric suffixes, it's scaling, not a pool pick.
   */
  isScaling(normalizedName: string): boolean {
    const rawEntries: string[] = [];
    for (const row of this.progression) {
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

  /** Each save's progression, by its last level's: good or poor. */
  saves(): { fortitude: SaveType; reflex: SaveType; will: SaveType } {
    return {
      fortitude: saveProgression(this.progression, "fortSave"),
      reflex: saveProgression(this.progression, "refSave"),
      will: saveProgression(this.progression, "willSave"),
    };
  }

  /** The spells known table, a row per level: none when it has no number. */
  spellsKnown(): number[][] | undefined {
    if (!this.spellsKnownRows || this.spellsKnownRows.length === 0) return undefined;
    const result: number[][] = [];
    let hasAny = false;
    for (const row of this.spellsKnownRows) {
      const slots = parseSpellSlotString(row);
      // Push empty row for all-dash entries to keep level-indexed alignment with perDay
      result.push(slots);
      if (slots.length > 0) hasAny = true;
    }
    return hasAny ? result : undefined;
  }

  /** The spells per day the table gives, a row per level: none when it gives none. */
  spellsPerDay(): number[][] | undefined {
    const result: number[][] = [];
    let hasAny = false;
    for (const row of this.progression) {
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
}
