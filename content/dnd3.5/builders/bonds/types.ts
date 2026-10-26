import type { ClassSeed } from "@/content/dnd3.5/builders/classes/types.ts";
import type { FeatSeed } from "@/content/dnd3.5/builders/feats/types.ts";
import type { RaceSeed } from "@/content/dnd3.5/builders/races/types.ts";

/**
 * A creature bonded to a character (a familiar, an animal companion, a special mount): its aptitudes, feats, races and
 * class, its races and class each saying its kind's partition, which a player character's would take without one.
 */
export interface BondContent {
  aptitudes: string[];
  feats: FeatSeed[];
  klass: Partitioned<ClassSeed>;
  races: Partitioned<RaceSeed>[];
}

/** A seed whose partition it says: a bonded creature's race's or class's. */
export type Partitioned<S extends { partition?: string }> = S & { partition: string };
