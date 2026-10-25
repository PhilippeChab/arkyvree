import type { BaseCodeFile } from "@/codegen/dnd3.5/tools/generator/code/BaseCodeFile.ts";
import type { RaceSeed } from "@/content/dnd3.5/builders/races/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Writing a race. */
export function WritesRaces<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingRaces extends Base {
    /** A race written as code, a list's item. */
    race(race: RaceSeed): string[] {
      return [
        `  {`,
        `    name: ${this.quote(race.name)},`,
        `    description: ${this.quote(race.description)},`,
        `    size: ${this.quote(race.size)},`,
        `    baseSpeed: ${race.baseSpeed},`,
        ...this.listField(
          "modifiers",
          (race.modifiers ?? []).map((m) => this.plainModifier(m)),
          "    ",
        ),
        ...(race.fields ? [`    fields: ${this.fieldValue(race.fields)},`] : []),
        `  },`,
      ];
    }
  }
  return WritingRaces;
}
