import { type BaseBookSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/BaseBookSeeds.ts";
import { buildClassSeed } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/classSeed.ts";
import { buildClassDomainPickFeats } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/domainPicks.ts";
import { buildClassFeatSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/featSeeds.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { ClassSeed } from "@/database/packages/dnd35/content/classes/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** A book's classes: each class's seed, and the feats its features are and its domain pool offers. */
export function Classes<B extends Constructor<BaseBookSeeds>>(Base: B) {
  abstract class WithClasses extends Base {
    /** A class's feats: its features' (`buildClassFeatSeeds`), and the domains it picks from (`buildClassDomainPickFeats`). */
    classFeatSeeds(ref: ClassReference): FeatSeed[] {
      return this.memoOf(ref, "classFeats", () => [
        ...buildClassFeatSeeds(ref, this),
        ...buildClassDomainPickFeats(ref, this),
      ]);
    }

    /** A class's seed (`buildClassSeed`). */
    classSeed(ref: ClassReference): ClassSeed {
      return this.memoOf(ref, "class", () => buildClassSeed(ref, this));
    }
  }
  return WithClasses;
}
