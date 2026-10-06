import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  type BaseGenerator,
  GENERATED_HEADER,
} from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { formatImport } from "@/database/packages/dnd35-from-parser/tools/generator/code/imports.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's index. */
export function GeneratesBooks<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingBooks extends Base {
    /** Regenerate index.ts for an extension's book: its content, as the extension seeds it. */
    writeBookIndex(book: string) {
      const dir = join(this.dir, book);
      const parts: { key: string; file: string; name: string }[] = [
        { key: "aptitudes", file: "aptitudes.ts", name: "ALL_APTITUDES" },
        { key: "standaloneFeats", file: "feats/index.ts", name: "ALL_STANDALONE_FEATS" },
        { key: "classFeats", file: "feats/classes/index.ts", name: "ALL_CLASS_FEATS" },
        { key: "cowFeats", file: "cowFeats.ts", name: "COW_FEATS" },
        { key: "spells", file: "spells/index.ts", name: "ALL_SPELLS" },
        { key: "cowSpells", file: "cowSpells.ts", name: "COW_SPELLS" },
        { key: "domains", file: "domains/data.ts", name: "ALL_DOMAINS" },
        { key: "classes", file: "classes/index.ts", name: "ALL_CLASSES" },
      ];
      const present = parts.filter((part) => existsSync(join(dir, part.file)));
      const files = [...new Set(present.map((part) => part.file))].sort();

      const lines: string[] = [];
      lines.push(...GENERATED_HEADER);
      lines.push(`import type { BookContent } from "@/database/packages/dnd35/content/rulesets/types.ts";`);
      for (const file of files) {
        const names = present
          .filter((part) => part.file === file)
          .map((part) => part.name)
          .sort();
        lines.push(formatImport(names, `./${file}`));
      }
      lines.push(``);
      lines.push(`export const BOOK: BookContent = {`);
      for (const part of parts) {
        lines.push(`  ${part.key}: ${present.includes(part) ? part.name : "[]"},`);
      }
      lines.push(`};`);
      lines.push(``);

      this.write(join(dir, "index.ts"), lines.join("\n"));
    }
  }
  return GeneratingBooks;
}
