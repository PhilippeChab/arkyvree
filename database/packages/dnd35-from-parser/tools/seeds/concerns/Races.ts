import { type BaseBookSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/BaseBookSeeds.ts";
import { buildRaceSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/races.ts";
import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";
import type { RaceSeed } from "@/database/packages/dnd35/content/races/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** A book's races. */
export function Races<B extends Constructor<BaseBookSeeds>>(Base: B) {
  abstract class WithRaces extends Base {
    /** The seeds of a race reference of the book. */
    raceSeeds(ref: RaceReference): RaceSeed[] {
      return this.memoOf(ref, "races", () => buildRaceSeeds(ref));
    }
  }
  return WithRaces;
}
