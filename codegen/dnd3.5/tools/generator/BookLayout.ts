/** A book's generated tree: each file's path in the book's folder, and the list it exports. */

import { toCamelCase, toConstName } from "@/codegen/dnd3.5/tools/text/names.ts";

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
 * of its index (`parts`), its feats file, its items' files and their index, its spell levels, and the file or the list
 * named after a class, a feat type, a spell level or a template family.
 */
class BookLayout {
  /** A book's feats file (`feats/feats.ts`): a list per feat type, and one per template family. */
  readonly featsFile = "feats/feats.ts";
  /** The files every book can have, by what they hold. */
  readonly files = {
    aptitudes: { path: "aptitudes.ts", list: "ALL_APTITUDES" },
    classFeats: { path: "feats/classes/index.ts", list: "ALL_CLASS_FEATS" },
    classes: { path: "classes/index.ts", list: "ALL_CLASSES" },
    cowFeats: { path: "cowFeats.ts", list: "COW_FEATS" },
    cowSpells: { path: "cowSpells.ts", list: "COW_SPELLS" },
    domainFeats: { path: "feats/domainFeats.ts", list: "DOMAIN_POOL_FEATS" },
    domains: { path: "domains.ts", list: "ALL_DOMAINS" },
    index: { path: "index.ts", list: "BOOK" },
    races: { path: "races.ts", list: "ALL_RACES" },
    spells: { path: "spells/index.ts", list: "ALL_SPELLS" },
    standaloneFeats: { path: "feats/index.ts", list: "ALL_STANDALONE_FEATS" },
    wizardSchools: { path: "wizardSchools.ts", list: "WIZARD_SCHOOLS" },
  } satisfies Record<string, BookFile>;
  /**
   * The files a book's items/ can hold, mundane then magic, each with the list it exports and the seeds it holds (of
   * the item and magic item seeds), in the order the items' index lists them.
   */
  readonly itemFiles = [
    { path: "simpleWeapons.ts", list: "SIMPLE_WEAPONS", seeds: "simpleWeapons" },
    { path: "martialWeapons.ts", list: "MARTIAL_WEAPONS", seeds: "martialWeapons" },
    { path: "exoticWeapons.ts", list: "EXOTIC_WEAPONS", seeds: "exoticWeapons" },
    { path: "armor.ts", list: "ARMOR", seeds: "armor" },
    { path: "shields.ts", list: "SHIELDS", seeds: "shields" },
    { path: "goods.ts", list: "GOODS", seeds: "goods" },
    { path: "magicArmor.ts", list: "MAGIC_ARMOR", seeds: "magicArmor" },
    { path: "magicShields.ts", list: "MAGIC_SHIELDS", seeds: "magicShields" },
    { path: "magicWeapons.ts", list: "MAGIC_WEAPONS", seeds: "magicWeapons" },
    { path: "wondrousItems.ts", list: "WONDROUS_ITEMS", seeds: "wondrousItems" },
    { path: "rings.ts", list: "RINGS", seeds: "rings" },
    { path: "rods.ts", list: "RODS", seeds: "rods" },
    { path: "staffs.ts", list: "STAFFS", seeds: "staffs" },
  ] as const;
  /** A book's items' index (`items/index.ts`): its item files' lists. */
  readonly itemsIndex = "items/index.ts";
  /** The parts of a book's index (`BookContent`), each by its key there, in the order it lists them. */
  readonly parts: BookPart[] = [
    { key: "aptitudes", file: this.files.aptitudes },
    { key: "standaloneFeats", file: this.files.standaloneFeats },
    { key: "classFeats", file: this.files.classFeats },
    { key: "cowFeats", file: this.files.cowFeats },
    { key: "spells", file: this.files.spells },
    { key: "cowSpells", file: this.files.cowSpells },
    { key: "domains", file: this.files.domains },
    { key: "classes", file: this.files.classes },
  ];
  /** The spell levels a book's spells/ has a file of, cantrips' first. */
  readonly spellLevels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  /** A class's feats' file (feats/classes/<slug>.ts). */
  classFeatsFile(className: string): BookFile {
    return { path: `feats/classes/${toCamelCase(className)}.ts`, list: `${toConstName(className)}_CLASS_FEATS` };
  }

  /** A class's file (classes/<slug>.ts), its seed the list it exports. */
  classFile(className: string): BookFile {
    return { path: `classes/${toCamelCase(className)}.ts`, list: toConstName(className) };
  }

  /** The list a feat type's feats are in the feats file (`GENERAL_FEATS`). */
  featTypeList(type: string): string {
    return `${type.toUpperCase().replace(/\s+/g, "_")}_FEATS`;
  }

  /** A spell level's file (spells/cantrips.ts, spells/level1.ts…). */
  spellFile(level: number): BookFile {
    return level === 0
      ? { path: "spells/cantrips.ts", list: "CANTRIPS" }
      : { path: `spells/level${level}.ts`, list: `LEVEL_${level}_SPELLS` };
  }

  /** The list a template family's feats are in the feats file (`WEAPON_FOCUS_FEATS`). */
  templateList(familyName: string): string {
    return `${toConstName(familyName)}_FEATS`;
  }
}

export default new BookLayout();
