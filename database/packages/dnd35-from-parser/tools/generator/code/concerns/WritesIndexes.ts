import { basename } from "node:path";

import BookLayout, {
  type BookFile,
  type BookPart,
} from "@/database/packages/dnd35-from-parser/tools/generator/BookLayout.ts";
import type { BaseCodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/BaseCodeFile.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Writing a book's indexes, each of the lists of the files beside it, and the book's own index. */
export function WritesIndexes<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingIndexes extends Base {
    /**
     * A book's index (index.ts): its content (`BookContent`), each of its parts from the file `present` lists it in,
     * an empty list when none does.
     */
    bookIndex(present: BookPart[]): void {
      const files = [...new Set(present.map((part) => part.file.path))].sort();
      for (const name of files) {
        this.gather(
          `./${name}`,
          present.filter((part) => part.file.path === name).map((part) => part.file.list),
        );
      }
      this.declare("BookContent");
      this.lines.push(
        `export const ${BookLayout.files.index.list}: BookContent = {`,
        ...BookLayout.parts.map((part) => `  ${part.key}: ${present.includes(part) ? part.file.list : "[]"},`),
        `};`,
        ``,
      );
    }

    /** A book's class feats' index (feats/classes/index.ts): the feats of its classes' feats `files`, each once. */
    classFeatIndex(files: BookFile[]): void {
      for (const { path, list } of files) this.gather(`./${basename(path)}`, [list]);
      this.declare("FeatSeed");
      // Each feat once, its first class's: a feat like "Familiar" may appear in multiple class feat files
      this.lines.push(
        `const _allClassFeats: FeatSeed[] = [`,
        ...files.map(({ list }) => `  ...${list},`),
        `];`,
        `export const ${BookLayout.files.classFeats.list}: FeatSeed[] = [...Map.groupBy(_allClassFeats, (f) => f.name).values()].map(([f]) => f);`,
        ``,
      );
    }

    /** A book's classes' index (classes/index.ts): the seed of each of its classes' `files`. */
    classIndex(files: BookFile[]): void {
      for (const { path, list } of files) this.gather(`./${basename(path)}`, [list]);
      this.list(
        BookLayout.files.classes.list,
        "ClassSeed",
        files.map(({ list }) => `  ${list},`),
      );
    }

    /** A book's standalone feats' index (feats/index.ts): every list of its feats `files`, in lint's order. */
    featIndex(files: { lists: string[]; path: string }[]): void {
      const standalone: string[] = [];
      for (const { path, lists } of files) {
        const sorted = [...lists].sort((a, b) => this.compareNames(a, b));
        this.gather(`./${basename(path)}`, sorted);
        standalone.push(...sorted.map((list) => `  ...${list},`));
      }
      this.list(BookLayout.files.standaloneFeats.list, "FeatSeed", standalone);
    }

    /** A book's items' index (items/index.ts): the list of each of its item `files`. */
    itemIndex(files: readonly BookFile[]): void {
      this.lines.push(...files.map(({ path, list }) => `export { ${list} } from "./${path}";`), ``);
    }

    /** A book's spells' index (spells/index.ts): the spells of each of its spell level `files`, at its level. */
    spellIndex(files: (BookFile & { level: number })[]): void {
      for (const { path, list } of files) this.gather(`./${basename(path)}`, [list]);
      this.list(
        BookLayout.files.spells.list,
        "SpellSeed",
        files.map(({ level, list }) => `  ...${list}.map((p) => ({ ...p, level: ${level} })),`),
      );
    }
  }
  return WritingIndexes;
}
