import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { BOOK_FILES } from "@/database/packages/dnd35-from-parser/tools/generator/bookLayout.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's races. */
export function GeneratesRaces<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingRaces extends Base {
    /** A book's races file (races.ts). */
    writeRaces(ref: RaceReference, book: string) {
      const seeds = Library.book(book).raceSeeds(ref);
      this.log(`Built ${seeds.length} race seeds`);

      const { path, list } = BOOK_FILES.races;
      this.writeList(join(this.dir, book, path), list, "RaceSeed", seeds, (file, race) => file.race(race));

      this.log(`\nDone!`);
    }
  }
  return GeneratingRaces;
}
