import type { BaseCodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/BaseCodeFile.ts";
import type { CowFeatEntry, CowSpellEntry } from "@/database/packages/dnd35/content/rulesets/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Writing what a book copies from the core rules: a feat, a spell. */
export function WritesCopies<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingCopies extends Base {
    /** A feat a book copies from the core rules written as code, a list's item. */
    cowFeat({ feat, aptitudes }: CowFeatEntry): string {
      return `  { feat: ${this.quote(feat)}, requirements: [], aptitudes: [${aptitudes.map((name) => this.quote(name)).join(", ")}] },`;
    }

    /** A spell a book copies from the core rules written as code, a list's item. */
    cowSpell({ spell, aptitudes }: CowSpellEntry): string {
      const lists = aptitudes.map(({ aptitude, level }) => `{ aptitude: ${this.quote(aptitude)}, level: ${level} }`);
      return `  { spell: ${this.quote(spell)}, aptitudes: [${lists.join(", ")}] },`;
    }
  }
  return WritingCopies;
}
