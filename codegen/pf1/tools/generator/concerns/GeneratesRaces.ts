import { type BaseBookGenerator } from "@/codegen/pf1/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/pf1/tools/generator/BookLayout.ts";
import type { RaceReference } from "@/codegen/pf1/tools/types/races.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Generating a book's races. */
export function GeneratesRaces<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingRaces extends Base {
    /** A race reference's races file (races.ts), its races' traits no reading took logged, for review. */
    writeRaces(ref: RaceReference) {
      const races = this.seeds.races(ref);
      const seeds = races.seeds();
      this.log(`Built ${seeds.length} race seeds`);
      for (const [race, unread] of Object.entries(races.unread()))
        if (unread.length > 0) this.log(`  ${race}: left to the table: ${unread.join("; ")}`);

      const { path, list } = BookLayout.files.races;
      this.writeList(path, list, "RaceSeed", seeds, (file, race) => file.race(race));
    }
  }
  return GeneratingRaces;
}
