import type { ClassSeed } from "@/database/packages/dnd35/content/classes/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import type { RaceSeed } from "@/database/packages/dnd35/content/races/types.ts";

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
