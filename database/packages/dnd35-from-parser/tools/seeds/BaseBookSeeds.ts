import { findFamilyFeat } from "@/database/packages/dnd35-from-parser/tools/detect/readers/requirements/featOptions.ts";
import { CORE_BOOK } from "@/database/packages/dnd35-from-parser/tools/references/files.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/references/ReferenceLoader.ts";
import type { ReferenceByType, ReferenceType } from "@/database/packages/dnd35-from-parser/tools/references/resolve.ts";
import type {
  ClassReferenceFile,
  InheritedSpellList,
} from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { DomainReference } from "@/database/packages/dnd35-from-parser/tools/types/domains.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import type { ItemReference } from "@/database/packages/dnd35-from-parser/tools/types/items.ts";
import { classSpells } from "@/database/packages/dnd35/content/aptitudes/names.ts";
import type { DomainSeed } from "@/database/packages/dnd35/content/domains/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import { stripSeparators } from "@/shared/text.ts";

import type { BookSeeds } from "./BookSeeds.ts";
import { CLASS_FEAT_FAMILY_NAMES } from "./classes/featFamilies.ts";
import { buildDomainFeatPoolSeeds, buildDomainSeeds } from "./domains.ts";
import { buildReferenceFeats } from "./feats.ts";
import { buildItemSeeds, type ItemSeedSets } from "./items.ts";

/** What a book's seeds read of the other books' (the `Library`): their seeds, and every book's class spell lists. */
export type Shelf = {
  book(name: string): BookSeeds;
  bookNames(): string[];
  classSpellLists(): Record<string, string>;
};

/**
 * A book's seeds' core, which its concerns (`concerns/`) build on: the book, its references, the library it's on (the
 * other books), and what several kinds of its seeds look up: the feats it already has, the families a prerequisite can
 * ask for, the domains its classes pick from, its base items' weights, its spells' names, the lists its classes draw
 * on others' for. Each is built once (`memo`, `memoOf`), as the references it's built from are loaded once.
 */
export class BaseBookSeeds {
  constructor(book: string, shelf: Shelf) {
    this.book = book;
    this.shelf = shelf;
  }

  /** What's built of the book, by what it is. */
  private readonly memos = new Map<string, unknown>();
  /** What's built of each of its references (or a reference made of one, a test's), by what it is. */
  private readonly memosOf = new WeakMap<object, Map<string, unknown>>();
  /** The library: the other books. */
  protected readonly shelf: Shelf;
  /** The book. */
  readonly book: string;

  /** The domains and feat pool feats of a domains reference, its spells named as `spellNames` names them. */
  protected domainsOf(ref: DomainReference): { poolFeats: FeatSeed[]; seeds: DomainSeed[] } {
    return this.memoOf(ref, "domains", () => ({
      seeds: buildDomainSeeds(ref, this.domainSpellNames()),
      poolFeats: buildDomainFeatPoolSeeds(ref),
    }));
  }

  /** The book's existing feats by their name's slug, its own and the core rules': a template family's left out. */
  private existingFeats(): Map<string, string> {
    return this.memo("existingFeats", () => {
      const feats = new Map<string, string>();
      // A template family ("Weapon Specialization") expands into a feat per option: its bare name is never seeded
      for (const book of [this.book, CORE_BOOK]) {
        const ref = ReferenceLoader.find(book, "feat");
        for (const feat of ref?.raw ?? []) if (!ref?.mapping[feat.name]?.template) feats.set(feat.name, feat.name);
      }
      return new Map([...feats.keys()].map((feat) => [stripSeparators(feat), feat]));
    });
  }

  /** What a feat reference makes (`buildReferenceFeats`). */
  protected featsOf(ref: FeatReference): ReturnType<typeof buildReferenceFeats> {
    return this.memoOf(ref, "feats", () => buildReferenceFeats(ref));
  }

  /** What an item reference makes (`buildItemSeeds`). */
  protected itemsOf(ref: ItemReference): ItemSeedSets {
    return this.memoOf(ref, "items", () => buildItemSeeds(ref));
  }

  /** What `build` builds, once: the same each time `key` asks for it. */
  protected memo<T>(key: string, build: () => T): T {
    if (!this.memos.has(key)) this.memos.set(key, build());
    return this.memos.get(key) as T;
  }

  /** What `build` builds of `of` (a reference), once: the same each time `key` asks for it of `of`. */
  protected memoOf<T>(of: object, key: string, build: () => T): T {
    let memos = this.memosOf.get(of);
    if (!memos) {
      memos = new Map();
      this.memosOf.set(of, memos);
    }
    if (!memos.has(key)) memos.set(key, build());
    return memos.get(key) as T;
  }

  /** The template families of the book's feats: none for a book without feats. */
  private templateFamilies(): Set<string> {
    const ref = this.reference("feat");
    return ref ? this.featsOf(ref).templateNames : new Set<string>();
  }

  /** The weight of each weapon, armor and shield the book's items seed, by name: what an item made from one weighs. */
  baseItemWeights(): Record<string, string> {
    const ref = this.reference("item");
    if (!ref) return {};
    const seeds = this.itemsOf(ref);
    const bases = [
      ...seeds.simpleWeapons,
      ...seeds.martialWeapons,
      ...seeds.exoticWeapons,
      ...seeds.armor,
      ...seeds.shields,
    ];
    return Object.fromEntries(bases.map((item) => [item.name, item.weight]));
  }

  /** The book's class references, by file: none for a book without classes. */
  classReferences(): ClassReferenceFile[] {
    return ReferenceLoader.loadClasses(this.book);
  }

  /** The spells the book's domains can name, by their lowercase name: the core rules' and the book's. */
  domainSpellNames(): Map<string, string> {
    return this.memo("domainSpellNames", () => {
      const names = [...this.shelf.book(CORE_BOOK).spellNames(), ...(this.book === CORE_BOOK ? [] : this.spellNames())];
      return new Map(names.map((name) => [name.toLowerCase(), name]));
    });
  }

  /**
   * The existing feat a name means: one by its letters (a class feature's "Two-weapon Fighting" is Two-Weapon
   * Fighting), or a family's feat for the option the name holds ("Skill Focus (Bluff)": Skill Focus: Bluff).
   */
  findExistingFeat(name: string): string | undefined {
    return this.existingFeats().get(stripSeparators(name)) ?? findFamilyFeat(name);
  }

  /**
   * The lists the book's classes draw on others' lists for (`inheritsFrom`): each class's own, or each of its `lists`.
   */
  inheritedLists(): { aptitude: string; list: InheritedSpellList }[] {
    return this.memo("inheritedLists", () => {
      const lists: { aptitude: string; list: InheritedSpellList }[] = [];
      for (const { ref } of this.classReferences()) {
        const { spells } = ref.mapping;
        if (!spells || !ref.raw?.name) continue;
        if (spells.inheritsFrom) lists.push({ aptitude: classSpells(ref.raw.name), list: spells.inheritsFrom });
        for (const list of spells.lists ?? []) lists.push({ aptitude: list.name, list: list.inheritsFrom });
      }
      return lists;
    });
  }

  /** The domains a class of the book can pick from (a divine crusader's pool): the core rules' and the book's. */
  pickableDomains(): DomainSeed[] {
    const domains = (seeds: BaseBookSeeds) => {
      const ref = seeds.reference("domain");
      return ref ? seeds.domainsOf(ref).seeds : [];
    };
    return [...domains(this.shelf.book(CORE_BOOK)), ...(this.book === CORE_BOOK ? [] : domains(this))];
  }

  /** The book's reference of `type`: none when the book has none. */
  reference<T extends Exclude<ReferenceType, "class">>(type: T): ReferenceByType[T] | undefined {
    return ReferenceLoader.find(this.book, type);
  }

  /**
   * The families the book's feats and classes can require: its own templates, for an extension the core rules' its
   * feats build on (Power Critical requires the SRD's Weapon Focus), and the class features' (Sneak Attack, Rage…).
   */
  requirableFamilies(): Set<string> {
    return this.memo(
      "requirableFamilies",
      () =>
        new Set([
          ...this.templateFamilies(),
          ...(this.book === CORE_BOOK ? [] : this.shelf.book(CORE_BOOK).templateFamilies()),
          ...CLASS_FEAT_FAMILY_NAMES,
        ]),
    );
  }

  /** The names of the book's own spells. */
  spellNames(): Set<string> {
    return this.memo("spellNames", () => new Set(this.reference("spell")?.raw.map((spell) => spell.name) ?? []));
  }
}
