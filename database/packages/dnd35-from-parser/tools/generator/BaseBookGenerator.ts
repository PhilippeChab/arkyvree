import { join } from "node:path";

import type { BookSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/BookSeeds.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
import { CORE_BOOK } from "@/database/packages/dnd35-from-parser/tools/vocabulary/books.ts";

import type { DeclaredType } from "./code/BaseCodeFile.ts";
import { CodeFile } from "./code/CodeFile.ts";
import { type GeneratedFolder } from "./GeneratedFolder.ts";

/**
 * A book's generator's core, which its concerns (`concerns/`) build on: the book, its seeds, which its files are
 * written from, the folder it writes them to (its own, `generated/<book>/`), and what several kinds of its files are
 * written with.
 */
export class BaseBookGenerator {
  constructor(folder: GeneratedFolder, book: string) {
    this.folder = folder;
    this.book = book;
    this.seeds = Library.book(book);
  }

  /** The folder the generation writes to, the book's files in its own. */
  protected readonly folder: GeneratedFolder;
  /** The book. */
  readonly book: string;
  /** The book's seeds. */
  readonly seeds: BookSeeds;

  /**
   * Whether the book copies feats and spells from the core rules (cowFeats.ts, cowSpells.ts): an extension with
   * classes. The core rules are what extensions copy from.
   */
  protected copiesFromCore(): boolean {
    return this.book !== CORE_BOOK && this.seeds.classReferences().length > 0;
  }

  /** Logs what the generator does, unless the generation is quiet. */
  protected log(message: string) {
    this.folder.log(message);
  }

  /** Writes the book's file at `path` (in its folder), under the comment that lists what's left to review (`notes`). */
  protected write(path: string, code: string, notes: string[] = []) {
    this.folder.write(join(this.book, path), code, notes);
  }

  /**
   * Writes the book's file of one list at `path`, `list` of `type` (a content type, or text): each of `seeds` written
   * as code by `write` (a seed's `CodeFile` writer, `file.race(race)`), the file's imports what they use.
   */
  protected writeList<T>(
    path: string,
    list: string,
    type: DeclaredType | "string",
    seeds: T[],
    write: (file: CodeFile, seed: T) => string | string[],
  ) {
    const file = new CodeFile();
    file.list(
      list,
      type,
      seeds.flatMap((seed) => write(file, seed)),
    );
    this.write(path, file.code());
  }

  /** Whether the generator wrote the book's file at `path` (in its folder). */
  protected wrote(path: string): boolean {
    return this.folder.wrote(join(this.book, path));
  }
}
