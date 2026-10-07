import { type BaseBookSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/BaseBookSeeds.ts";
import {
  type buildReferenceFeats,
  getFeatAptitudeSources,
} from "@/database/packages/dnd35-from-parser/tools/seeds/feats.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** A book's standalone feats: those of its feat reference, by feat type, and its template families. */
export function Feats<B extends Constructor<BaseBookSeeds>>(Base: B) {
  abstract class WithFeats extends Base {
    /** A feat reference's feats as the aptitude list reads them (`getFeatAptitudeSources`): none without one. */
    featAptitudeSources(
      ref: FeatReference | undefined = this.reference("feat"),
    ): Pick<FeatSeed, "aptitudes" | "modifiers" | "name">[] {
      return ref ? getFeatAptitudeSources(this.featsOf(ref)) : [];
    }

    /** What a feat reference of the book makes: its feats by feat type, and its template families. */
    featSeeds(ref: FeatReference): ReturnType<typeof buildReferenceFeats> {
      return this.featsOf(ref);
    }
  }
  return WithFeats;
}
