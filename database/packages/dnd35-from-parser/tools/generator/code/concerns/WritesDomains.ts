import type { BaseCodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/BaseCodeFile.ts";
import { listField, quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import type { DomainSeed } from "@/database/packages/dnd35/content/domains/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Writing a domain. */
export function WritesDomains<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingDomains extends Base {
    /** A domain written as code, a list's item. */
    domain(domain: DomainSeed): string[] {
      return [
        `  {`,
        `    name: ${quote(domain.name)},`,
        `    description: ${quote(domain.description)},`,
        ...listField(
          "modifiers",
          (domain.modifiers ?? []).map((m) => this.plainModifier(m)),
          "    ",
        ),
        `    spells: [`,
        ...domain.spells.map((spell) => `      { name: ${quote(spell.name)}, level: ${spell.level} },`),
        `    ],`,
        `  },`,
      ];
    }
  }
  return WritingDomains;
}
