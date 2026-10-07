import type { BaseCodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/BaseCodeFile.ts";
import { quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import type { SpellSeed } from "@/database/packages/dnd35/content/spells/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Writing a spell. */
export function WritesSpells<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingSpells extends Base {
    /** A spell written as code, a list's item, without its level: its file is its level's. */
    spell(spell: SpellSeed): string[] {
      const levels = Object.entries(spell.aptitudeLevels ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([aptitude, level]) => `${quote(aptitude)}: ${level}`);
      return [
        `  {`,
        `    name: ${quote(spell.name)},`,
        `    description: ${quote(spell.description)},`,
        `    aptitudes: [${spell.aptitudes.map(quote).join(", ")}],`,
        ...(levels.length > 0 ? [`    aptitudeLevels: { ${levels.join(", ")} },`] : []),
        ...(spell.savingThrow ? [`    savingThrow: ${quote(spell.savingThrow)},`] : []),
        `    properties: [`,
        ...spell.properties.map((p) => `      ${this.property(p)},`),
        `    ],`,
        `  },`,
      ];
    }
  }
  return WritingSpells;
}
