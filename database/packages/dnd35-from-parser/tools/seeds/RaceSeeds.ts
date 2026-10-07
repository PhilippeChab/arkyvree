/** A race reference's seeds: its RaceSeed[]. */

import { type RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";
import type { RaceSeed } from "@/database/packages/dnd35/content/races/types.ts";
import { SIZE_OPTIONS } from "@/shared/enums.ts";

import { ReferenceSeeds } from "./ReferenceSeeds.ts";

/** A race reference's seeds (`seeds`): those its mapping doesn't skip, each with its size checked. */
export class RaceSeeds extends ReferenceSeeds<RaceReference> {
  /**
   * The races a race reference seeds (those its mapping doesn't skip), each with its size, checked: its mapping's (its
   * override's, else as scraped). Generation throws a size's problem, and `parser:validate` reports it.
   */
  seeded() {
    const skipped = this.skipped();
    return this.ref.raw
      .filter(({ name }) => !skipped.has(name))
      .map((entry) => ({
        name: entry.name,
        entry,
        size: this.checkOneOf(this.ref.mapping[entry.name].size, SIZE_OPTIONS, `${entry.name}'s size`),
      }));
  }

  /** Its seeds: a size the seed doesn't accept throws. */
  seeds(): RaceSeed[] {
    return this.memo("seeds", () =>
      this.seeded().map(({ entry, size }) => {
        const mapping = this.ref.mapping[entry.name];

        return {
          name: mapping.name,
          description: mapping.description ?? entry.description,
          size: this.checkedValue(size),
          baseSpeed: mapping.baseSpeed,
          ...(mapping.modifiers?.length ? { modifiers: mapping.modifiers } : {}),
          ...(mapping.properties?.length ? { properties: mapping.properties } : {}),
        };
      }),
    );
  }

  /** The races a race reference's mapping skips (its overrides), which the seed leaves out. */
  skipped(): Set<string> {
    return new Set(this.ref.raw.filter(({ name }) => this.ref.mapping[name].skip).map(({ name }) => name));
  }
}
