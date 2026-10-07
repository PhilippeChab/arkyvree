import type { BaseCodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/BaseCodeFile.ts";
import type { DomainSeed } from "@/database/packages/dnd35/content/domains/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Writing a domain. */
export function WritesDomains<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingDomains extends Base {
    /** A domain written as code, a list's item. */
    domain(domain: DomainSeed): string[] {
      return [
        `  {`,
        `    name: ${this.quote(domain.name)},`,
        `    description: ${this.quote(domain.description)},`,
        ...this.listField(
          "modifiers",
          (domain.modifiers ?? []).map((m) => this.plainModifier(m)),
          "    ",
        ),
        `    spells: [`,
        ...domain.spells.map((spell) => `      { name: ${this.quote(spell.name)}, level: ${spell.level} },`),
        `    ],`,
        `  },`,
      ];
    }
  }
  return WritingDomains;
}
