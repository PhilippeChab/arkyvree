import { relative, resolve } from "node:path";

import { GeneratedFolder } from "@/codegen/core/GeneratedFolder.ts";
import References from "@/codegen/dnd3.5/tools/references/References.ts";
import type { ReferenceFilters } from "@/codegen/dnd3.5/tools/types/reference.ts";

import { BookGenerator } from "./BookGenerator.ts";

/**
 * Generates the content package's seed data from the references, into a folder (`dir`: generated/'s copy, or a
 * test's), a book at a time, whole (`BookGenerator`): a book that fails doesn't stop the others.
 */
export class Generator {
  constructor(dir: string, quiet: boolean) {
    this.folder = new GeneratedFolder(dir, quiet);
  }

  /** The folder it writes to, and what it wrote there. */
  private readonly folder: GeneratedFolder;

  /**
   * Regenerates a book (`BookGenerator`). Its spells change what every other book copies: their copied spells are
   * rewritten too.
   */
  private generateBook(book: string) {
    const generator = new BookGenerator(this.folder, book);
    generator.generate();
    if (generator.seeds.reference("spell")) {
      for (const other of References.books())
        if (other !== book) new BookGenerator(this.folder, other).writeCowSpells();
    }
    this.folder.log(`\nDone! Review the generated files in content/dnd3.5/generated/.`);
  }

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
