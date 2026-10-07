import { existsSync } from "node:fs";
import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { BOOK_FILES, BOOK_PARTS } from "@/database/packages/dnd35-from-parser/tools/generator/bookLayout.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's index. */
export function GeneratesBooks<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingBooks extends Base {
    /** Regenerate index.ts for a book: its content, as its package seeds it (the core rules' with what they add). */
    writeBookIndex(book: string) {
      const dir = join(this.dir, book);
      const present = BOOK_PARTS.filter((part) => existsSync(join(dir, part.file.path)));
      const files = [...new Set(present.map((part) => part.file.path))].sort();

      const file = new CodeFile();
      for (const name of files) {
        file.gather(
          `./${name}`,
          present.filter((part) => part.file.path === name).map((part) => part.file.list),
        );
      }
      file.declare("BookContent");
      file.lines.push(
        `export const ${BOOK_FILES.index.list}: BookContent = {`,
        ...BOOK_PARTS.map((part) => `  ${part.key}: ${present.includes(part) ? part.file.list : "[]"},`),
        `};`,
        ``,
      );
      this.write(join(dir, BOOK_FILES.index.path), file.code());
    }
  }
  return GeneratingBooks;
}
