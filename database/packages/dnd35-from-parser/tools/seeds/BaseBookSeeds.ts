import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";
import type {
  ClassReference,
  ClassReferenceFile,
  InheritedSpellList,
} from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { DomainReference } from "@/database/packages/dnd35-from-parser/tools/types/domains.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import type { ItemReference } from "@/database/packages/dnd35-from-parser/tools/types/items.ts";
import type { MagicItemReference } from "@/database/packages/dnd35-from-parser/tools/types/magicItems.ts";
import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";
import type { ReferenceByType, ReferenceType } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";
import type { SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
import type { WizardSchoolReference } from "@/database/packages/dnd35-from-parser/tools/types/wizardSchools.ts";
import { CORE_BOOK } from "@/database/packages/dnd35-from-parser/tools/vocabulary/books.ts";
import { CLASS_FEAT_FAMILY_NAMES } from "@/database/packages/dnd35-from-parser/tools/vocabulary/classFeatFamilies.ts";
import { findFamilyFeat } from "@/database/packages/dnd35-from-parser/tools/vocabulary/featOptions.ts";
import { classSpells } from "@/database/packages/dnd35/content/aptitudes/names.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import type { DomainSeed } from "@/database/packages/dnd35/content/domains/types.ts";
import type { WizardSchoolSeed } from "@/database/packages/dnd35/content/wizardSchools/types.ts";
import { stripSeparators } from "@/shared/text.ts";

import type { BookSeeds } from "./BookSeeds.ts";
import { ClassSeeds } from "./classes/ClassSeeds.ts";
import { DomainSeeds } from "./DomainSeeds.ts";
import { FeatSeeds } from "./FeatSeeds.ts";
import { ItemSeeds } from "./ItemSeeds.ts";
import { MagicItemSeeds } from "./MagicItemSeeds.ts";
import { RaceSeeds } from "./RaceSeeds.ts";
import { SpellSeeds } from "./SpellSeeds.ts";

/** What a book's seeds read of the other books' (the `Library`): their seeds, and every book's class spell lists. */
export type Shelf = {
  book(name: string): BookSeeds;
  bookNames(): string[];
  classSpellLists(): Record<string, string>;
};

/**
 * A book's seeds' core, which its concerns (`concerns/`) build on: the book, its references, the library it's on (the
 * other books), each kind's seeds of its references (`classes`, `feats`, `spells`…, each built once), and what several
 * kinds of its seeds look up: the feats it already has, the families a prerequisite can
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

  /** The book's existing feats by their name's slug, its own and the core rules': a template family's left out. */
  private existingFeats(): Map<string, string> {
    return this.memo("existingFeats", () => {
      const feats = new Map<string, string>();
      // A template family ("Weapon Specialization") expands into a feat per option: its bare name is never seeded
      for (const book of [this.book, CORE_BOOK]) {
        const ref = References.find(book, "feat");
        for (const feat of ref?.raw ?? []) if (!ref?.mapping[feat.name]?.template) feats.set(feat.name, feat.name);
      }
      return new Map([...feats.keys()].map((feat) => [stripSeparators(feat), feat]));
    });
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
    return ref ? this.feats(ref).templateNames : new Set<string>();
  }

  /** The weight of each weapon, armor and shield the book's items seed, by name: what an item made from one weighs. */
  baseItemWeights(): Record<string, string> {
    const ref = this.reference("item");
    return ref ? this.items(ref).weights() : {};
  }

  /** A class reference's seeds: its seed and the feats it makes. */
  classes(ref: ClassReference): ClassSeeds {
    return this.memoOf(ref, "classes", () => new ClassSeeds(ref, this));
  }

  /** The book's class references, by file: none for a book without classes. */
  classReferences(): ClassReferenceFile[] {
    return References.loadClasses(this.book);
  }

  /** Every book's class spell lists (the library's), each by the class its spells' level lines name. */
  classSpellLists(): Record<string, string> {
    return this.shelf.classSpellLists();
  }

  /** A domains reference's seeds: its domains and their feat pools' feats. */
  domains(ref: DomainReference): DomainSeeds {
    return this.memoOf(ref, "domains", () => new DomainSeeds(ref, this));
  }

  /** The spells the book's domains can name, by their lowercase name: the core rules' and the book's. */
  domainSpellNames(): Map<string, string> {
    return this.memo("domainSpellNames", () => {
      const names = [...this.shelf.book(CORE_BOOK).spellNames(), ...(this.book === CORE_BOOK ? [] : this.spellNames())];
      return new Map(names.map((name) => [name.toLowerCase(), name]));
    });
  }

  /**
   * `requirements`, each check of a family by its own name made a check of any of its feats (`FeatSeeds.familyChecks`),
   * of the families the book can require (`requirableFamilies`).
   */
  familyChecks(requirements: RequirementEntry[]): RequirementEntry[] {
    return FeatSeeds.familyChecks(requirements, this.requirableFamilies());
  }

  /** A feat reference's seeds: its feats by feat type, and its template families. */
  feats(ref: FeatReference): FeatSeeds {
    return this.memoOf(ref, "feats", () => new FeatSeeds(ref, this));
  }

  /**
   * The existing feat a name means: one by its letters (a class feature's "Two-weapon Fighting" is Two-Weapon
   * Fighting), or a family's feat for the option the name holds ("Skill Focus (Bluff)": Skill Focus: Bluff).
   */
  findExistingFeat(name: string): string | undefined {
    return this.existingFeats().get(stripSeparators(name)) ?? findFamilyFeat(name);
  }

  /**
   * A spell's level on a list a class draws on (`inheritsFrom`): on the first of its classes' lists that has it, when
   * it's of the list's schools and has none of its excluded descriptors.
   */
  inheritedLevel(
    spell: Pick<SpellReference["raw"][number], "school" | "descriptors">,
    levelEntries: { className: string; level: number }[],
    list: InheritedSpellList,
  ): number | undefined {
    if (list.schools && !list.schools.includes(spell.school)) return undefined;
    if (spell.descriptors.some((descriptor) => list.excludeDescriptors?.includes(descriptor))) return undefined;
    for (const className of list.classes) {
      const entry = levelEntries.find((le) => le.className === className);
      if (entry) return entry.level;
    }
    return undefined;
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

  /** An item reference's seeds: its weapons, armor, shields and goods, by kind. */
  items(ref: ItemReference): ItemSeeds {
    return this.memoOf(ref, "items", () => new ItemSeeds(ref, this));
  }

  /** A magic item reference's seeds. */
  magicItems(ref: MagicItemReference): MagicItemSeeds {
    return this.memoOf(ref, "magicItems", () => new MagicItemSeeds(ref, this));
  }

  /**
   * The lists other books' classes draw on others' lists for (`inheritedLists`), which an extension's spells can be on:
   * none for the core rules, whose spells reach them through each book's copies.
   */
  othersInheritedLists(): { aptitude: string; list: InheritedSpellList }[] {
    if (this.book === CORE_BOOK) return [];
    return this.shelf
      .bookNames()
      .flatMap((other) => (other === this.book ? [] : this.shelf.book(other).inheritedLists()));
  }

  /** The domains a class of the book can pick from (a divine crusader's pool): the core rules' and the book's. */
  pickableDomains(): DomainSeed[] {
    const domains = (seeds: BaseBookSeeds) => {
      const ref = seeds.reference("domain");
      return ref ? seeds.domains(ref).seeds : [];
    };
    return [...domains(this.shelf.book(CORE_BOOK)), ...(this.book === CORE_BOOK ? [] : domains(this))];
  }

  /** A race reference's seeds. */
  races(ref: RaceReference): RaceSeeds {
    return this.memoOf(ref, "races", () => new RaceSeeds(ref, this));
  }

  /** The book's reference of `type`: none when the book has none. */
  reference<T extends Exclude<ReferenceType, "class">>(type: T): ReferenceByType[T] | undefined {
    return References.find(this.book, type);
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

  /** A spell reference's seeds. */
  spells(ref: SpellReference): SpellSeeds {
    return this.memoOf(ref, "spells", () => new SpellSeeds(ref, this));
  }

  /** A wizard school reference's seeds (the book's own, by default): none for a book without one. */
  wizardSchoolSeeds(ref: WizardSchoolReference | undefined = this.reference("wizardSchool")): WizardSchoolSeed[] {
    if (!ref) return [];
    return this.memoOf(ref, "wizardSchools", () =>
      ref.raw.map((entry) => ({
        name: entry.name,
        description: ref.mapping[entry.name].description,
        prohibitedSchoolCount: entry.prohibitedSchoolCount,
      })),
    );
  }
}
