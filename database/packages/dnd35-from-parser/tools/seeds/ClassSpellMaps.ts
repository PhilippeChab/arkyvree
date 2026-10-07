/** The spell lists a spell's level line names by its class's name or abbreviation, read from the class references once. */

import { existsSync } from "node:fs";

import { listReferenceBooks, REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/references/files.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/references/ReferenceLoader.ts";
import { classSpells } from "@/database/packages/dnd35/content/aptitudes/names.ts";

/** The spell lists by class name, built from every book's class references the first time they're asked for. */
class ClassSpellMaps {
  /** The maps, once built. */
  private maps?: { classMap: Record<string, string>; dualMap: Record<string, string[]> };

  /**
   * Build class name → aptitude name mappings by scanning all class reference files.
   * Any class with a `mapping.spells` config gets an entry: "ClassName" → "ClassName Spells".
   * Also includes legacy abbreviations for the SRD single-page parser.
   */
  private build(): { classMap: Record<string, string>; dualMap: Record<string, string[]> } {
    const classMap: Record<string, string> = {
      // Legacy SRD abbreviations (single-page parser uses these)
      "Sor/Wiz": "Wizard Spells",
      Wiz: "Wizard Spells",
      Sor: "Sorcerer Spells",
      Clr: "Cleric Spells",
      Brd: "Bard Spells",
      Drd: "Druid Spells",
      Pal: "Paladin Spells",
      Rgr: "Ranger Spells",
    };

    const dualMap: Record<string, string[]> = {
      "Sor/Wiz": ["Wizard Spells", "Sorcerer Spells"],
      "sorcerer/wizard": ["Wizard Spells", "Sorcerer Spells"],
    };

    // Auto-discover from class references (scoped to book if provided)
    if (existsSync(REFERENCE_DIR)) {
      for (const book of listReferenceBooks()) {
        // Discover casting classes
        for (const { ref } of ReferenceLoader.loadClasses(book)) {
          if (ref.mapping?.spells && ref.raw?.name) {
            const aptName = classSpells(ref.raw.name);
            classMap[ref.raw.name] = aptName;
            classMap[ref.raw.name.toLowerCase()] = aptName;
          }
        }

        // Note: domain entries (Air, Fire, Courage, etc.) are NOT mapped here.
        // Domain spell linking is handled separately by seed-domains.ts, which
        // links spells to domain aptitudes by name. Adding them here would cause
        // duplicate links and broken class-level requirements.
      }
    }

    return { classMap, dualMap };
  }

  private built() {
    this.maps ??= this.build();
    return this.maps;
  }

  /** Each class's spell list ("Wizard Spells"), by its name, lowercased name, or the SRD's abbreviation ("Wiz"). */
  abbreviations(): Record<string, string> {
    return this.built().classMap;
  }

  /** The combined classes a level line names ("Sor/Wiz"), each with the spell lists it stands for. */
  duals(): Record<string, string[]> {
    return this.built().dualMap;
  }
}

export default new ClassSpellMaps();
