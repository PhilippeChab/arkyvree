/** The template families feats can require, each book's read from its feat reference once. */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { CLASS_FEAT_FAMILY_NAMES } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/classes.ts";
import { buildReferenceFeats } from "@/database/packages/dnd35-from-parser/tools/generator/code/referenceFeats.ts";
import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/referenceLoader.ts";

/** Each book's template families, read once: every class of the book asks for them. */
class TemplateFamilies {
  /** Each book's template families, by book. */
  private readonly byBook = new Map<string, Set<string>>();

  /** A book's template families, from its feat reference: none for a book without feats. */
  ofBook(book: string): Set<string> {
    let names = this.byBook.get(book);
    if (!names) {
      const path = join(REFERENCE_DIR, book, "feats.json");
      names = existsSync(path)
        ? buildReferenceFeats(ReferenceLoader.load(path, "feat")).templateNames
        : new Set<string>();
      this.byBook.set(book, names);
    }
    return names;
  }

  /**
   * The families a book's feats and classes can require: its own templates (`own`), for an extension the core rules'
   * its feats build on (Power Critical requires the SRD's Weapon Focus), and the class features' (Sneak Attack, Rage…).
   */
  requirable(book: string, own = this.ofBook(book)): Set<string> {
    return new Set([...own, ...(book === "srd" ? [] : this.ofBook("srd")), ...CLASS_FEAT_FAMILY_NAMES]);
  }
}

export default new TemplateFamilies();
