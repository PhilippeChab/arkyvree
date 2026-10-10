import type { BaseCodeFile } from "@/codegen/dnd3.5/tools/generator/code/BaseCodeFile.ts";
import type { RaceSeed } from "@/content/core/builders/races/types.ts";
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
        ...this.listField(
          "properties",
          (race.properties ?? []).map((p) => this.property(p)),
          "    ",
        ),
        `  },`,
      ];
    }
  }
  return WritingRaces;
}
