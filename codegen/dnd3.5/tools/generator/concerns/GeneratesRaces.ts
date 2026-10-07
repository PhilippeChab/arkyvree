import { type BaseBookGenerator } from "@/codegen/dnd3.5/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/dnd3.5/tools/generator/BookLayout.ts";
import type { RaceReference } from "@/codegen/dnd3.5/tools/types/races.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Generating a book's races. */
export function GeneratesRaces<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingRaces extends Base {
    /** A race reference's races file (races.ts). */
    writeRaces(ref: RaceReference) {
      const seeds = this.seeds.races(ref).seeds();
      this.log(`Built ${seeds.length} race seeds`);

      const { path, list } = BookLayout.files.races;
      this.writeList(path, list, "RaceSeed", seeds, (file, race) => file.race(race));

      this.log(`\nDone!`);
    }
  }
  return GeneratingRaces;
}
