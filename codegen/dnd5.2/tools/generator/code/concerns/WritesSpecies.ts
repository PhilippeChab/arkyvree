import type { BaseCodeFile } from "@/codegen/dnd5.2/tools/generator/code/BaseCodeFile.ts";
import type { SpeciesSeed } from "@/content/dnd5.2/builders/species/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Writing a species. */
export function WritesSpecies<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingSpecies extends Base {
    /** A species written as code, a list's item: its fields as stored, then its modifiers. */
    species(species: SpeciesSeed): string[] {
      return [
        `  {`,
        `    name: ${this.quote(species.name)},`,
        `    description: ${this.quote(species.description)},`,
        `    fields: ${this.seedFields(species.fields)},`,
        ...(species.links?.subspeciesOf
          ? [`    links: { subspeciesOf: ${this.quote(species.links.subspeciesOf)} },`]
          : []),
        ...this.listField(
          "modifiers",
          (species.modifiers ?? []).map((modifier) => this.plainModifier(modifier)),
          "    ",
        ),
        `  },`,
      ];
    }
  }
  return WritingSpecies;
}
