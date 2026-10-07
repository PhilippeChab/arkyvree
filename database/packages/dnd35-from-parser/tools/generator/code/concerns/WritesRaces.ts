import type { BaseCodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/BaseCodeFile.ts";
import { listField, quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import type { RaceSeed } from "@/database/packages/dnd35/content/races/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Writing a race. */
export function WritesRaces<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingRaces extends Base {
    /** A race written as code, a list's item. */
    race(race: RaceSeed): string[] {
      return [
        `  {`,
        `    name: ${quote(race.name)},`,
        `    description: ${quote(race.description)},`,
        `    size: ${quote(race.size)},`,
        `    baseSpeed: ${race.baseSpeed},`,
        ...listField(
          "modifiers",
          (race.modifiers ?? []).map((m) => this.plainModifier(m)),
          "    ",
        ),
        ...listField(
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
