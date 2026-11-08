import { dirname, join } from "node:path";

import { type BaseBookGenerator } from "@/codegen/dnd5.2/tools/generator/BaseBookGenerator.ts";
import BookLayout, { type BookFile } from "@/codegen/dnd5.2/tools/generator/BookLayout.ts";
import { CodeFile } from "@/codegen/dnd5.2/tools/generator/code/CodeFile.ts";
import type { Constructor } from "@/lib/mixins.ts";

/**
 * Generating a book's indexes, which list its files (`CodeFile`'s `WritesIndexes`): its classes', its class feats' and
 * its items', and the book's own index. An index lists the files the generator wrote of the book (its standalone
 * feats' is `GeneratesFeats`', its spells' `GeneratesSpells`').
 */
export function GeneratesIndexes<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingIndexes extends Base {
    /**
     * The book's index (index.ts): its content, as its package seeds it, each part a file the generator wrote of it, an
     * empty list when it wrote none.
     */
    writeBookIndex() {
      const file = new CodeFile();
      file.bookIndex(BookLayout.parts.filter((part) => this.wrote(part.file.path)));
      this.write(BookLayout.files.index.path, file.code());
    }

    /** The book's class feats' index (feats/classes/index.ts): each of its classes' feats file (`files`). */
    writeClassFeatIndex(files: BookFile[]) {
      if (files.length === 0) return;
      const file = new CodeFile();
      file.classFeatIndex(files.toSorted((a, b) => (a.path < b.path ? -1 : 1)));
      this.write(BookLayout.files.classFeats.path, file.code());
    }

    /** The book's classes' index (classes/index.ts): each of its classes' file (`files`). */
    writeClassIndex(files: BookFile[]) {
      if (files.length === 0) return;
      const file = new CodeFile();
      file.classIndex(files);
      this.write(BookLayout.files.classes.path, file.code());
    }

    /** The book's items' index (items/index.ts): every item file the generator wrote of it, mundane or magic. */
    writeItemIndex() {
      const folder = dirname(BookLayout.itemsIndex);
      const files = BookLayout.itemFiles.filter(({ path }) => this.wrote(join(folder, path)));
      if (files.length === 0) return;

      const file = new CodeFile();
      file.itemIndex(files);
      this.write(BookLayout.itemsIndex, file.code());
    }
  }
  return GeneratingIndexes;
}
