/**
 * The feats a book already has, by name: a class feature that duplicates one grants it rather than a feat of its own.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/referenceLoader.ts";
import { findFamilyFeat } from "@/database/packages/dnd35-from-parser/tools/scraper/featOptions.ts";
import { stripSeparators } from "@/shared/text.ts";

/** Each book's existing feats, read once: every class feature of the book asks for them. */
class ExistingFeats {
  /** The feats of each book (and of the core rules, which it extends), by book. */
  private readonly byBook = new Map<string, Set<string>>();

  /** Each book's feats by their name's slug. */
  private readonly bySlug = new Map<string, Map<string, string>>();

  private load(book?: string): Set<string> {
    const key = book ?? "__srd__";
    if (this.byBook.has(key)) return this.byBook.get(key)!;

    const feats = new Set<string>();
    // Load feat names from SRD (parent) and the current book's reference JSON.
    // Skip template feats (family parents like "Weapon Specialization") — they
    // expand into per-variant feats during generation and the bare name is never
    // seeded, so matching against it would create phantom freeFeat lookups.
    const books = book ? [book, "srd"] : ["srd"];
    for (const b of books) {
      const featsPath = join(REFERENCE_DIR, b, "feats.json");
      if (!existsSync(featsPath)) continue;
      const ref = ReferenceLoader.load(featsPath, "feat");
      for (const feat of ref.raw) {
        const mapped = ref.mapping[feat.name];
        if (mapped?.template) continue;
        feats.add(feat.name);
      }
    }

    this.byBook.set(key, feats);
    return feats;
  }

  /**
   * The existing feat a name means: one by its letters (a class feature's "Two-weapon Fighting" is Two-Weapon
   * Fighting), or a family's feat for the option the name holds ("Skill Focus (Bluff)": Skill Focus: Bluff).
   */
  find(book: string, name: string): string | undefined {
    let bySlug = this.bySlug.get(book);
    if (!bySlug) {
      bySlug = new Map([...this.load(book)].map((feat) => [stripSeparators(feat), feat]));
      this.bySlug.set(book, bySlug);
    }
    return bySlug.get(stripSeparators(name)) ?? findFamilyFeat(name);
  }
}

export default new ExistingFeats();
