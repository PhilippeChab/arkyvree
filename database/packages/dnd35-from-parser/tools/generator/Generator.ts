import { relative, resolve } from "node:path";

import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
import type { ReferenceFilters } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";
import { include } from "@/server/mixins.ts";

import { BaseGenerator } from "./BaseGenerator.ts";
import { GeneratesBooks } from "./concerns/GeneratesBooks.ts";
import { GeneratesClasses } from "./concerns/GeneratesClasses.ts";
import { GeneratesCopies } from "./concerns/GeneratesCopies.ts";
import { GeneratesDomains } from "./concerns/GeneratesDomains.ts";
import { GeneratesFeats } from "./concerns/GeneratesFeats.ts";
import { GeneratesItems } from "./concerns/GeneratesItems.ts";
import { GeneratesMagicItems } from "./concerns/GeneratesMagicItems.ts";
import { GeneratesRaces } from "./concerns/GeneratesRaces.ts";
import { GeneratesSpells } from "./concerns/GeneratesSpells.ts";
import { GeneratesWizardSchools } from "./concerns/GeneratesWizardSchools.ts";

/**
 * Generates the content package's seed data from the references, into `dir`, a book at a time (`generateBook`), from
 * its seeds: a step that writes one kind of file is a concern (`concerns/`), and a book's, made of them all, is its
 * own.
 */
export class Generator extends include(
  BaseGenerator,
  GeneratesBooks,
  GeneratesClasses,
  GeneratesCopies,
  GeneratesDomains,
  GeneratesFeats,
  GeneratesItems,
  GeneratesMagicItems,
  GeneratesRaces,
  GeneratesSpells,
  GeneratesWizardSchools,
) {
  /** Regenerates each of `books` (`generateBook`): one that fails doesn't stop the others, its failure is returned. */
  private generateBooks(books: string[]): string[] {
    const failures: string[] = [];
    for (const book of books) {
      try {
        this.generateBook(book);
      } catch (error) {
        failures.push(`${book}: ${error instanceof Error ? error.message : error}`);
      }
    }
    return failures;
  }

  /**
   * Regenerates the books the references a filter picks are of (a book, a type of reference or a name, when given):
   * every book when none is. The books that failed are returned.
   */
  generateAll(filters: ReferenceFilters): string[] {
    const refs = References.files(filters);
    return this.generateBooks([...new Set(refs.map((ref) => ref.book))].sort());
  }

  /**
   * A book's files, from its seeds: each of its references' (its classes', its feats', its spells' and its domains' (a
   * book with spells has a domains file, an empty one when it has no domains reference), its races', its wizard
   * schools', its items' and its magic items'), and what they make together (its aptitudes, what it copies from the
   * core rules, its indexes, which list what was written, and its index); then the files its folder held that it no
   * longer makes are removed. Its spells change what every other book copies: their copied spells are rewritten too.
   */
  generateBook(book: string) {
    const seeds = Library.book(book);
    const classes = seeds.classReferences();
    const featRef = seeds.reference("feat");
    const spellRef = seeds.reference("spell");
    for (const { ref } of classes) this.writeClass(ref, book);
    if (featRef) this.writeFeats(featRef, book);
    if (spellRef) {
      this.writeSpells(spellRef, book);
      this.writeDomains(book);
    }
    const raceRef = seeds.reference("race");
    if (raceRef) this.writeRaces(raceRef, book);
    const wizardSchoolRef = seeds.reference("wizardSchool");
    if (wizardSchoolRef) this.writeWizardSchools(wizardSchoolRef, book);
    const itemRef = seeds.reference("item");
    if (itemRef) this.writeItems(itemRef, book);
    const magicItemRef = seeds.reference("magicItem");
    if (magicItemRef) this.writeMagicItems(magicItemRef, book);

    // What its classes, feats and domains make together
    if (classes.length > 0 || featRef || spellRef) {
      this.writeAptitudes(book);
      this.writeFeatIndex(book);
    }
    this.writeCowFeats(book);
    this.writeCowSpells(book);
    this.writeClassIndex(book);
    this.writeClassFeatIndex(book);
    this.writeSpellIndex(book);
    this.writeItemIndex(book);
    this.writeBookIndex(book);
    this.removeUnwritten(book);

    if (spellRef) for (const other of References.books()) if (other !== book) this.writeCowSpells(other);
    this.log(`\nDone! Review the generated files and copy to database/packages/dnd35/ when ready.`);
  }

  /**
   * Regenerates a reference file's book (`generateBook`), from its references: a file outside them (an edited copy)
   * would be ignored, so it's refused. The book's failure is returned.
   */
  generateReference(jsonPath: string): string[] {
    const ref = References.files().find(({ path }) => path === resolve(jsonPath));
    const dir = relative(process.cwd(), References.dir);
    if (!ref) throw new Error(`${jsonPath} isn't a reference file of ${dir}/: a book is generated from its own`);
    return this.generateBooks([ref.book]);
  }
}
