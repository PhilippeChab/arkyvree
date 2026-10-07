import { existsSync } from "node:fs";
import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's index. */
export function GeneratesBooks<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingBooks extends Base {
    /** Regenerate index.ts for a book: its content, as its package seeds it (the core rules' with what they add). */
    writeBookIndex(book: string) {
      const dir = join(this.dir, book);
      const parts: { key: string; file: string; name: string }[] = [
        { key: "aptitudes", file: "aptitudes.ts", name: "ALL_APTITUDES" },
        { key: "standaloneFeats", file: "feats/index.ts", name: "ALL_STANDALONE_FEATS" },
        { key: "classFeats", file: "feats/classes/index.ts", name: "ALL_CLASS_FEATS" },
        { key: "cowFeats", file: "cowFeats.ts", name: "COW_FEATS" },
        { key: "spells", file: "spells/index.ts", name: "ALL_SPELLS" },
        { key: "cowSpells", file: "cowSpells.ts", name: "COW_SPELLS" },
        { key: "domains", file: "domains.ts", name: "ALL_DOMAINS" },
        { key: "classes", file: "classes/index.ts", name: "ALL_CLASSES" },
      ];
      const present = parts.filter((part) => existsSync(join(dir, part.file)));
      const files = [...new Set(present.map((part) => part.file))].sort();

      const file = new CodeFile();
      for (const name of files) {
        file.gather(
          `./${name}`,
          present.filter((part) => part.file === name).map((part) => part.name),
        );
      }
      file.declare("BookContent");
      file.lines.push(
        `export const BOOK: BookContent = {`,
        ...parts.map((part) => `  ${part.key}: ${present.includes(part) ? part.name : "[]"},`),
        `};`,
        ``,
      );
      this.write(join(dir, "index.ts"), file.code());
    }
  }
  return GeneratingBooks;
}
