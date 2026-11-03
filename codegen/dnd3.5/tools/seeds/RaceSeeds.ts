/** A race reference's seeds: its RaceSeed[]. */

import { type RaceReference } from "@/codegen/dnd3.5/tools/types/races.ts";
import { grantLanguage } from "@/content/dnd3.5/builders/languages/knowledge.ts";
import type { RaceSeed } from "@/content/dnd3.5/builders/races/types.ts";
import { RACE_BASE_SPEED, RACE_SIZE } from "@/vocabulary/dnd3.5/fields/index.ts";
import { SIZE_OPTIONS } from "@/vocabulary/dnd3.5/sizes.ts";

import { ReferenceSeeds } from "./ReferenceSeeds.ts";

/** A race reference's seeds (`seeds`): those its mapping doesn't skip, each with its size checked. */
export class RaceSeeds extends ReferenceSeeds<RaceReference> {
  /**
   * The races a race reference seeds (those its mapping doesn't skip), each with its size, checked: its mapping's (its
   * override's, else as scraped). Generation throws a size's problem, and `parser:dnd3.5:validate` reports it.
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

  /**
   * Its seeds, each with its fields as stored (its size and speed, and its mapping's), its mapping's modifiers, then
   * the grants of the languages it speaks from the start: a size the seed doesn't accept throws.
   */
  seeds(): RaceSeed[] {
    return this.memo("seeds", () =>
      this.seeded().map(({ entry, size }) => {
        const mapping = this.ref.mapping[entry.name];
        const modifiers = [
          ...(mapping.modifiers ?? []),
          ...(mapping.languages ?? []).map((name) => grantLanguage(name)),
        ];

        return {
          name: mapping.name,
          description: mapping.description ?? entry.description,
          fields: { [RACE_SIZE]: this.checkedValue(size), [RACE_BASE_SPEED]: mapping.baseSpeed, ...mapping.fields },
          ...(modifiers.length > 0 ? { modifiers } : {}),
        };
      }),
    );
  }

  /** The races a race reference's mapping skips (its overrides), which the seed leaves out. */
  skipped(): Set<string> {
    return new Set(this.ref.raw.filter(({ name }) => this.ref.mapping[name].skip).map(({ name }) => name));
  }
}
