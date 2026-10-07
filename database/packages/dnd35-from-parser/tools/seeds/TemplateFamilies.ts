/** The template families feats can require, each book's read from its feat reference once. */

import { CORE_BOOK } from "@/database/packages/dnd35-from-parser/tools/references/files.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/references/ReferenceLoader.ts";
import { CLASS_FEAT_FAMILY_NAMES } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/featFamilies.ts";
import { buildReferenceFeats } from "@/database/packages/dnd35-from-parser/tools/seeds/feats.ts";

/** Each book's template families, read once: every class of the book asks for them. */
class TemplateFamilies {
  /** Each book's template families, by book. */
  private readonly byBook = new Map<string, Set<string>>();

  /** A book's template families, from its feat reference: none for a book without feats. */
  ofBook(book: string): Set<string> {
    let names = this.byBook.get(book);
    if (!names) {
      const ref = ReferenceLoader.find(book, "feat");
      names = ref ? buildReferenceFeats(ref).templateNames : new Set<string>();
      this.byBook.set(book, names);
    }
    return names;
  }

  /**
   * The families a book's feats and classes can require: its own templates (`own`), for an extension the core rules'
   * its feats build on (Power Critical requires the SRD's Weapon Focus), and the class features' (Sneak Attack, Rage…).
   */
  requirable(book: string, own = this.ofBook(book)): Set<string> {
    return new Set([...own, ...(book === CORE_BOOK ? [] : this.ofBook(CORE_BOOK)), ...CLASS_FEAT_FAMILY_NAMES]);
  }
}

export default new TemplateFamilies();
