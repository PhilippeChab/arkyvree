import type { ClassSeed } from "@/content/dnd3.5/builders/classes/types.ts";
import type { FeatSeed } from "@/content/dnd3.5/builders/feats/types.ts";
import type { RaceSeed } from "@/content/dnd3.5/builders/races/types.ts";

/**
 * A creature bonded to a character (a familiar, an animal companion, a special mount): its aptitudes, feats, races and
 * class, all of `kind`.
 */
export type BondContent = {
  aptitudes: string[];
  feats: FeatSeed[];
  kind: string;
  klass: ClassSeed;
  races: RaceSeed[];
};
