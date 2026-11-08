/** A book's generated tree: each file's path in the book's folder, and the list it exports. */

import { toCamelCase } from "@/codegen/core/text/names.ts";

/** A generated file: its path in the book's folder, and the list it exports. */
export interface BookFile {
  list: string;
  path: string;
}

/** A part of a book's index (`BookContent`): its key there, and the file it's from. */
export interface BookPart {
  file: BookFile;
  key: string;
}

/**
 * A book's generated tree (`generated/<book>/`): the files every book can have, by what they hold (`files`), the parts
 * of its index (`parts`), its standalone feats' files, its items' files and their index, its spell levels, and the
 * file or the list named after a class, a feat category or a spell level.
 */
class BookLayout {
  /**
   * The standalone feats' files past the feats file, each with the list it exports: its backgrounds' ability scores',
   * its species' traits and lineages', and its tools' proficiencies.
   */
  readonly featFiles = {
    backgrounds: { path: "feats/backgrounds.ts", list: "BACKGROUND_FEATS" },
    species: { path: "feats/species.ts", list: "SPECIES_FEATS" },
    tools: { path: "feats/tools.ts", list: "TOOL_FEATS" },
  } satisfies Record<string, BookFile>;
  /** A book's feats file (`feats/feats.ts`): a list per category, which the standalone feats' index gathers. */
  readonly featsFile = "feats/feats.ts";
  /** The files every book can have, by what they hold. */
  readonly files = {
    aptitudes: { path: "aptitudes.ts", list: "ALL_APTITUDES" },
    backgrounds: { path: "backgrounds.ts", list: "ALL_BACKGROUNDS" },
    classFeats: { path: "feats/classes/index.ts", list: "ALL_CLASS_FEATS" },
    classes: { path: "classes/index.ts", list: "ALL_CLASSES" },
    index: { path: "index.ts", list: "BOOK" },
    species: { path: "species.ts", list: "ALL_SPECIES" },
    spells: { path: "spells/index.ts", list: "ALL_SPELLS" },
    standaloneFeats: { path: "feats/index.ts", list: "ALL_STANDALONE_FEATS" },
  } satisfies Record<string, BookFile>;
  /**
   * The files a book's items/ can hold, mundane then magic, each with the list it exports and the seeds it holds (of
   * the item and magic item seeds), in the order the items' index lists them.
   */
  readonly itemFiles = [
    { path: "simpleWeapons.ts", list: "SIMPLE_WEAPONS", seeds: "simpleWeapons" },
    { path: "martialWeapons.ts", list: "MARTIAL_WEAPONS", seeds: "martialWeapons" },
    { path: "armor.ts", list: "ARMOR", seeds: "armor" },
    { path: "shields.ts", list: "SHIELDS", seeds: "shields" },
    { path: "gear.ts", list: "GEAR", seeds: "gear" },
    { path: "tools.ts", list: "TOOLS", seeds: "tools" },
    { path: "magicWeapons.ts", list: "MAGIC_WEAPONS", seeds: "magicWeapons" },
    { path: "magicAmmunition.ts", list: "MAGIC_AMMUNITION", seeds: "magicAmmunition" },
    { path: "magicArmor.ts", list: "MAGIC_ARMOR", seeds: "magicArmor" },
    { path: "magicShields.ts", list: "MAGIC_SHIELDS", seeds: "magicShields" },
    { path: "potions.ts", list: "POTIONS", seeds: "potions" },
    { path: "rings.ts", list: "RINGS", seeds: "rings" },
    { path: "rods.ts", list: "RODS", seeds: "rods" },
    { path: "scrolls.ts", list: "SCROLLS", seeds: "scrolls" },
    { path: "staffs.ts", list: "STAFFS", seeds: "staffs" },
    { path: "wands.ts", list: "WANDS", seeds: "wands" },
    { path: "wondrousItems.ts", list: "WONDROUS_ITEMS", seeds: "wondrousItems" },
  ] as const;
  /** A book's items' index (`items/index.ts`): its item files' lists. */
  readonly itemsIndex = "items/index.ts";
  /** The parts of a book's index (`BookContent`), each by its key there, in the order it lists them. */
  readonly parts: BookPart[] = [
    { key: "aptitudes", file: this.files.aptitudes },
    { key: "standaloneFeats", file: this.files.standaloneFeats },
    { key: "classFeats", file: this.files.classFeats },
    { key: "spells", file: this.files.spells },
    { key: "classes", file: this.files.classes },
    { key: "species", file: this.files.species },
    { key: "backgrounds", file: this.files.backgrounds },
  ];
  /** The spell levels a book's spells/ has a file of, cantrips' first. */
  readonly spellLevels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  /** A name as a constant's: "Fighting Style" → "FIGHTING_STYLE". */
  private constName(name: string): string {
    return name
      .replace(/[()'']/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .toUpperCase();
  }

  /** A feat category's list in the feats file: "Fighting Style" → FIGHTING_STYLE_FEATS. */
  categoryList(category: string): string {
    return `${this.constName(category)}_FEATS`;
  }

  /** A class's feats' file (feats/classes/<camel>.ts). */
  classFeatsFile(className: string): BookFile {
    return { path: `feats/classes/${toCamelCase(className)}.ts`, list: `${this.constName(className)}_CLASS_FEATS` };
  }

  /** A class's file (classes/<camel>.ts), its seed the list it exports. */
  classFile(className: string): BookFile {
    return { path: `classes/${toCamelCase(className)}.ts`, list: this.constName(className) };
  }

  /** A spell level's file (spells/cantrips.ts, spells/level1.ts…). */
  spellFile(level: number): BookFile {
    return level === 0
      ? { path: "spells/cantrips.ts", list: "CANTRIPS" }
      : { path: `spells/level${level}.ts`, list: `LEVEL_${level}_SPELLS` };
  }
}

export default new BookLayout();
