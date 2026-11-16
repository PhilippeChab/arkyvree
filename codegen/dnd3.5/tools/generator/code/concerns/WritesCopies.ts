import type { BaseCodeFile } from "@/codegen/dnd3.5/tools/generator/code/BaseCodeFile.ts";
import type { CowFamilyEntry } from "@/codegen/dnd3.5/tools/seeds/concerns/Copies.ts";
import type { CowFeatEntry, CowSpellEntry } from "@/content/dnd3.5/builders/rulesets/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Writing what a book copies from the core rules: a feat, a spell. */
export function WritesCopies<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingCopies extends Base {
    /**
     * A feat a book copies from the core rules written as code, a list's item: a family's, a feat for each of its
     * options, over the list its feats are made over.
     */
    cowFeat(copy: CowFeatEntry | CowFamilyEntry): string {
      const aptitudes = `[${copy.aptitudes.map((name) => this.quote(name)).join(", ")}]`;
      if ("feat" in copy) return `  { feat: ${this.quote(copy.feat)}, requirements: [], aptitudes: ${aptitudes} },`;
      const { familyName, options } = copy.family;
      this.uses.add(options);
      const feat = `\`${this.escapeTemplate(familyName)}: \${option}\``;
      return `  ...${options}.map((option) => ({ feat: ${feat}, requirements: [], aptitudes: ${aptitudes} })),`;
    }

    /** A spell a book copies from the core rules written as code, a list's item. */
    cowSpell({ spell, aptitudes }: CowSpellEntry): string {
      const lists = aptitudes.map(({ aptitude, level }) => `{ aptitude: ${this.quote(aptitude)}, level: ${level} }`);
      return `  { spell: ${this.quote(spell)}, aptitudes: [${lists.join(", ")}] },`;
    }
  }
  return WritingCopies;
}
