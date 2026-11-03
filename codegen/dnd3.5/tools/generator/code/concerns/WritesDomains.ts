import type { BaseCodeFile } from "@/codegen/dnd3.5/tools/generator/code/BaseCodeFile.ts";
import type { DomainSeed } from "@/content/dnd3.5/builders/domains/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

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
