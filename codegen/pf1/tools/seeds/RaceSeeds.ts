import RaceTraits from "@/codegen/pf1/tools/detect/RaceTraits.ts";
import type { RaceEntry, RaceReference } from "@/codegen/pf1/tools/types/races.ts";
import type { RaceSeed } from "@/content/pf1/builders/races/types.ts";
import { RACE_BASE_SPEED, RACE_SIZE } from "@/vocabulary/pf1/fields/index.ts";

import { Memos } from "./Memos.ts";

/** A race read: its seed, and the traits its reading left to the table (`RaceTraits.unread`). */
interface ReadRace {
  seed: RaceSeed;
  unread: string[];
}

/**
 * A race reference's seeds (`seeds`): each race's traits read (`RaceTraits`) into its fields and modifiers, its
 * description its override's (in the parser's own words: its page's isn't open content), else a sentence of its size
 * and speed. What no reading takes is listed by race (`unread`), for review.
 */
export class RaceSeeds {
  constructor(readonly ref: RaceReference) {}

  /** What it built, by what it is. */
  private readonly memos = new Memos();

  /** Each race, read. */
  private read(): ReadRace[] {
    return this.memos.of("read", () => this.ref.raw.map((entry) => this.readRace(entry)));
  }

  /** A race's traits read into its seed. */
  private readRace(entry: RaceEntry): ReadRace {
    const traits = new RaceTraits(entry);
    const fields = traits.fields();
    const modifiers = traits.modifiers();
    const description =
      this.ref.overrides?.[entry.name]?.description ??
      `A ${String(fields[RACE_SIZE]).toLowerCase()} race with a base speed of ${fields[RACE_BASE_SPEED]} feet.`;
    return {
      seed: { name: entry.name, description, fields, ...(modifiers.length > 0 ? { modifiers } : {}) },
      unread: traits.unread(),
    };
  }

  /** Its races' seeds. */
  seeds(): RaceSeed[] {
    return this.read().map(({ seed }) => seed);
  }

  /** The traits no reading took, by race: the table's to apply. */
  unread(): Record<string, string[]> {
    return Object.fromEntries(this.read().map(({ seed, unread }) => [seed.name, unread]));
  }
}
