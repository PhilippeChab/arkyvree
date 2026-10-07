import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import { buildRaceSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/races.ts";
import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's races. */
export function GeneratesRaces<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingRaces extends Base {
    /** A book's races file (races.ts). */
    writeRaces(ref: RaceReference, book: string) {
      const seeds = buildRaceSeeds(ref);
      this.log(`Built ${seeds.length} race seeds`);

      const file = new CodeFile();
      file.list(
        "ALL_RACES",
        "RaceSeed",
        seeds.flatMap((race) => file.race(race)),
      );
      this.write(join(this.dir, book, "races.ts"), file.code());

      this.log(`\nDone!`);
    }
  }
  return GeneratingRaces;
}
