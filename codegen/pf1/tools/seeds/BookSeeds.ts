import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import References from "@/codegen/pf1/tools/references/References.ts";
import type { ClassReference } from "@/codegen/pf1/tools/types/classes.ts";
import type { DomainReference } from "@/codegen/pf1/tools/types/domains.ts";
import type { FeatReference } from "@/codegen/pf1/tools/types/feats.ts";
import type { ItemReference } from "@/codegen/pf1/tools/types/items.ts";
import type { MagicItemReference } from "@/codegen/pf1/tools/types/magicItems.ts";
import type { RaceReference } from "@/codegen/pf1/tools/types/races.ts";
import type { ReferenceByType, ReferenceType } from "@/codegen/pf1/tools/types/reference.ts";
import type { SpellReference } from "@/codegen/pf1/tools/types/spells.ts";

import { ClassSeeds } from "./classes/ClassSeeds.ts";
import { DomainSeeds } from "./DomainSeeds.ts";
import { FeatSeeds } from "./FeatSeeds.ts";
import { ItemSeeds } from "./ItemSeeds.ts";
import { MagicItemSeeds } from "./MagicItemSeeds.ts";
import { Memos } from "./Memos.ts";
import { RaceSeeds } from "./RaceSeeds.ts";
import { SpellSeeds } from "./SpellSeeds.ts";

/**
 * A book's seeds: the book, its references, and each kind's seeds of a reference (`classes`, `feats`, `spells`…), each
 * built once per reference (`memoOf`), as the references they're built from are loaded once. A Pathfinder reference
 * stores what its page gives and its corrections alone: each kind's seeds read it (`detect/`) as they're built.
 */
export class BookSeeds {
  constructor(readonly book: string) {}

  /** What's built of each of its references, by what it is. */
  private readonly memosOf = new WeakMap<object, Memos>();

  /** What `build` builds of `of` (a reference), once: the same each time `key` asks for it of `of`. */
  private memoOf<T>(of: object, key: string, build: () => T): T {
    let memos = this.memosOf.get(of);
    if (!memos) {
      memos = new Memos();
      this.memosOf.set(of, memos);
    }
    return memos.of(key, build);
  }

  /** A class reference's seeds: its seed, the feats its features are, its bonus feat lists. */
  classes(ref: ClassReference): ClassSeeds {
    return this.memoOf(ref, "classes", () => new ClassSeeds(ref));
  }

  /** The book's class references, by their file's name: none for a book without classes. */
  classReferences(): ClassReference[] {
    const dir = join(References.dir, this.book, "classes");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => References.load(join(dir, file), "class"));
  }

  /**
   * A domains reference's seeds: its domains, its subdomains left out, their spells named as the book's spells' seeds
   * name them (their pages' names, for a spell its seeds don't have).
   */
  domains(ref: DomainReference): DomainSeeds {
    return this.memoOf(ref, "domains", () => {
      const spellRef = this.reference("spell");
      const seeded = spellRef
        ? this.spells(spellRef)
            .seeds()
            .map(({ name }) => name)
        : [];
      // A name the seeds give wins over its page's, by the same key
      return new DomainSeeds(ref, [...(spellRef?.raw.map(({ name }) => name) ?? []), ...seeded]);
    });
  }

  /** A feat reference's seeds: its standalone feats. */
  feats(ref: FeatReference): FeatSeeds {
    return this.memoOf(ref, "feats", () => new FeatSeeds(ref));
  }

  /** An item reference's seeds: its weapons, armor, shields and goods, by kind. */
  items(ref: ItemReference): ItemSeeds {
    return this.memoOf(ref, "items", () => new ItemSeeds(ref));
  }

  /**
   * A magic item reference's seeds: its magic armor, shields and weapons, wondrous items, rings, rods and staffs, an
   * item made from a base one weighing its base's (the book's items') when its stat block gives no weight.
   */
  magicItems(ref: MagicItemReference): MagicItemSeeds {
    return this.memoOf(ref, "magicItems", () => {
      const itemRef = this.reference("item");
      return new MagicItemSeeds(ref, itemRef ? this.items(itemRef).weights() : {});
    });
  }

  /** A race reference's seeds. */
  races(ref: RaceReference): RaceSeeds {
    return this.memoOf(ref, "races", () => new RaceSeeds(ref));
  }

  /** The book's reference of `type`, loaded once: none when the book has none. */
  reference<T extends Exclude<ReferenceType, "class">>(type: T): ReferenceByType[T] | undefined {
    const path = References.path(this.book, type);
    return existsSync(path) ? References.load(path, type) : undefined;
  }

  /** A spell reference's seeds: its spells, each at its level. */
  spells(ref: SpellReference): SpellSeeds {
    return this.memoOf(ref, "spells", () => new SpellSeeds(ref));
  }
}
