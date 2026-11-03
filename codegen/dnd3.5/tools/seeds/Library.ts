import References from "@/codegen/dnd3.5/tools/references/References.ts";
import { classSpells } from "@/content/dnd3.5/builders/aptitudes/names.ts";

import { BookSeeds } from "./BookSeeds.ts";
import { Memos } from "./Memos.ts";

/** Every book's seeds (`book`), each book's built once, and what a book's seeds read across books. */
class Library {
  /** Each book's seeds, by book. */
  private readonly books = new Map<string, BookSeeds>();
  /** What's built across books, by what it is. */
  private readonly memos = new Memos();

  /** A book's seeds. */
  book(name: string): BookSeeds {
    let seeds = this.books.get(name);
    if (!seeds) {
      seeds = new BookSeeds(name, this);
      this.books.set(name, seeds);
    }
    return seeds;
  }

  /** The books, by name. */
  bookNames(): string[] {
    return References.books();
  }

  /**
   * The spell list a spell's level line names a class's by, its name ("Wizard") or its name lowercased: "Wizard
   * Spells", for every book's spellcasting classes (those with a spell list).
   */
  classSpellLists(): Record<string, string> {
    return this.memos.of("classSpellLists", () =>
      Object.fromEntries(
        this.bookNames().flatMap((book) =>
          this.book(book)
            .classReferences()
            .filter(({ ref }) => ref.mapping?.spells && ref.raw?.name)
            .flatMap(({ ref }) => [
              [ref.raw.name, classSpells(ref.raw.name)],
              [ref.raw.name.toLowerCase(), classSpells(ref.raw.name)],
            ]),
        ),
      ),
    );
  }
}

export default new Library();
