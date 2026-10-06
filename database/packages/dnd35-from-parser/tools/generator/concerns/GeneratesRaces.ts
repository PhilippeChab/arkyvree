import { join } from "node:path";

import { buildRaceSeeds } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/races.ts";
import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import {
  stringifyModifier,
  stringifyProperty,
} from "@/database/packages/dnd35-from-parser/tools/generator/code/customization.ts";
import { listField, quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's races. */
export function GeneratesRaces<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingRaces extends Base {
    /** A book's races file (races/data.ts). */
    writeRaces(ref: RaceReference, book: string) {
      const seeds = buildRaceSeeds(ref);
      this.log(`Built ${seeds.length} race seeds`);

      // Generate data.ts
      const lines: string[] = [];
      lines.push(`export const ALL_RACES: RaceDefinition[] = [`);
      for (const r of seeds) {
        lines.push(`  {`);
        lines.push(`    name: ${quote(r.name)},`);
        lines.push(`    description: ${quote(r.description)},`);
        lines.push(`    size: ${quote(r.size)},`);
        lines.push(`    baseSpeed: ${r.baseSpeed},`);
        lines.push(...listField("modifiers", (r.modifiers ?? []).map(stringifyModifier), "    "));
        lines.push(...listField("properties", (r.properties ?? []).map(stringifyProperty), "    "));
        lines.push(`  },`);
      }
      lines.push(`];`);
      lines.push(``);

      const head = [`import type { RaceDefinition } from "@/database/packages/dnd35/content/races/types.ts";`, ``];
      this.write(join(this.dir, book, "races", "data.ts"), [...head, ...lines].join("\n"));

      this.log(`\nDone!`);
    }
  }
  return GeneratingRaces;
}
