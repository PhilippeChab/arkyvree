import { type BaseBookSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/BaseBookSeeds.ts";
import { ClassSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/ClassSeeds.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { ClassSeed } from "@/database/packages/dnd35/content/classes/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** A book's classes: each class's seed, and the feats its features are and its domain pool offers. */
export function Classes<B extends Constructor<BaseBookSeeds>>(Base: B) {
  abstract class WithClasses extends Base {
    /** A class's feats (`ClassSeeds.feats`). */
    classFeatSeeds(ref: ClassReference): FeatSeed[] {
      return this.memoOf(ref, "classFeats", () => this.classSeeds(ref).feats());
    }

    /** A class's seed (`ClassSeeds.seed`). */
    classSeed(ref: ClassReference): ClassSeed {
      return this.memoOf(ref, "class", () => this.classSeeds(ref).seed());
    }

    /** A class's seeds: what its seed and its feats are built from. */
    classSeeds(ref: ClassReference): ClassSeeds {
      return this.memoOf(ref, "classSeeds", () => new ClassSeeds(ref, this));
    }
  }
  return WithClasses;
}
