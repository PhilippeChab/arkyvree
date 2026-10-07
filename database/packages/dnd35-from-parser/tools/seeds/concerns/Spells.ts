import { type BaseBookSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/BaseBookSeeds.ts";
import { buildSpellSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/spells.ts";
import type { SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
import { CORE_BOOK } from "@/database/packages/dnd35-from-parser/tools/vocabulary/books.ts";
import type { SpellSeed } from "@/database/packages/dnd35/content/spells/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** A book's spells. */
export function Spells<B extends Constructor<BaseBookSeeds>>(Base: B) {
  abstract class WithSpells extends Base {
    /**
     * The seeds of a spell reference of the book (its own, by default), sorted by level, then name: none for a book
     * without one. An extension's spell can be on the lists other books' classes draw on others' lists for
     * (`inheritsFrom`): the book seeds its own copy of each that takes one, which a ruleset merges with that book's
     * when it takes both, as it does a class list the spell's level line names. The core rules' spells reach them
     * through each book's copies.
     */
    spellSeeds(ref: SpellReference | undefined = this.reference("spell")): SpellSeed[] {
      if (!ref) return [];
      return this.memoOf(ref, "spells", () => {
        const othersInherited =
          this.book === CORE_BOOK
            ? []
            : this.shelf
                .bookNames()
                .flatMap((other) => (other === this.book ? [] : this.shelf.book(other).inheritedLists()));
        return buildSpellSeeds(ref, othersInherited, this.shelf.classSpellLists());
      });
    }
  }
  return WithSpells;
}
