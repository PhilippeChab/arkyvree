import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import { buildCowFeats, buildCowSpells } from "@/database/packages/dnd35-from-parser/tools/seeds/copies.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating what a book copies from the core rules: its copied feats (cowFeats.ts) and spells (cowSpells.ts). */
export function GeneratesCopies<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingCopies extends Base {
    /** A book's cowFeats.ts: each core feat its classes' bonus feat lists name, with the lists it joins. */
    writeCowFeats(book: string) {
      if (!this.copiesFromCore(book)) return;
      const lines = [
        `import type { CowFeatEntry } from "@/database/packages/dnd35/content/rulesets/types.ts";`,
        ``,
        `export const COW_FEATS: CowFeatEntry[] = [`,
        ...buildCowFeats(book).map(
          ({ feat, aptitudes }) =>
            `  { feat: ${quote(feat)}, requirements: [], aptitudes: [${aptitudes.map(quote).join(", ")}] },`,
        ),
        `];`,
        ``,
      ];
      this.write(join(this.dir, book, "cowFeats.ts"), lines.join("\n"));
    }

    /** A book's cowSpells.ts: each core spell it copies, with the lists it joins and its level on each. */
    writeCowSpells(book: string) {
      if (!this.copiesFromCore(book)) return;
      const lines = [
        `import type { CowSpellEntry } from "@/database/packages/dnd35/content/rulesets/types.ts";`,
        ``,
        `export const COW_SPELLS: CowSpellEntry[] = [`,
        ...buildCowSpells(book).map(({ spell, aptitudes }) => {
          const aptStr = aptitudes.map((a) => `{ aptitude: ${quote(a.aptitude)}, level: ${a.level} }`).join(", ");
          return `  { spell: ${quote(spell)}, aptitudes: [${aptStr}] },`;
        }),
        `];`,
        ``,
      ];
      this.write(join(this.dir, book, "cowSpells.ts"), lines.join("\n"));
    }
  }
  return GeneratingCopies;
}
