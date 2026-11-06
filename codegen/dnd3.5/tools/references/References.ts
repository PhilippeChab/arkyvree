/**
 * The 3.5 books' references, on core's store (`ReferenceStore`: found, read, written and loaded as every ruleset's
 * parser's are). What the generator reads is derived from each reference's stored parts each time it's loaded, by its
 * kind's detector: `detected`, parsed from `raw` (wizard schools have none), and `mapping`, each entity as the seeds
 * make it, its overrides applied. The overrides win over both, so a correction takes effect at the next generate and
 * can't be lost to a re-scrape.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { ReferenceStore } from "@/codegen/core/references/ReferenceStore.ts";
import { stringifyStably } from "@/codegen/core/text/json.ts";
import { ClassDetector } from "@/codegen/dnd3.5/tools/detect/classes/ClassDetector.ts";
import { DomainDetector } from "@/codegen/dnd3.5/tools/detect/DomainDetector.ts";
import { FeatDetector } from "@/codegen/dnd3.5/tools/detect/FeatDetector.ts";
import { ItemDetector } from "@/codegen/dnd3.5/tools/detect/ItemDetector.ts";
import { MagicItemDetector } from "@/codegen/dnd3.5/tools/detect/MagicItemDetector.ts";
import { RaceDetector } from "@/codegen/dnd3.5/tools/detect/RaceDetector.ts";
import { SpellDetector } from "@/codegen/dnd3.5/tools/detect/SpellDetector.ts";
import { WizardSchoolDetector } from "@/codegen/dnd3.5/tools/detect/WizardSchoolDetector.ts";
import type { ClassReferenceFile } from "@/codegen/dnd3.5/tools/types/classes.ts";
import type { ReferenceByType, ReferenceType, StoredReference } from "@/codegen/dnd3.5/tools/types/reference.ts";
import { CORE_BOOK } from "@/vocabulary/dnd3.5/books.ts";

/**
 * What a reference's detector reads of the books' other references: a book's classes, which a feat reference's mapping
 * reads, and the core rules' spells as stored, which an extension's spell may be written as ("As darkvision, except…").
 */
interface OtherReferences {
  classesOf(book: string): ClassReferenceFile[];
  coreSpells(): StoredReference<"spell">;
}

/** The file a book's reference of each type is stored in, in the book's folder (a class's is its own, in `classes/`). */
const REFERENCE_FILE_NAMES: { [T in Exclude<ReferenceType, "class">]: string } = {
  domain: "domains.json",
  feat: "feats.json",
  item: "items.json",
  magicItem: "magicItems.json",
  race: "races.json",
  spell: "spells.json",
  wizardSchool: "wizardSchools.json",
};

/** Each type's detector, which derives what the generator reads from a stored reference. */
const RESOLVERS: {
  [T in ReferenceType]: (stored: StoredReference<T>, others: OtherReferences) => ReferenceByType[T];
} = {
  class: (stored) => new ClassDetector(stored).resolve(),
  domain: (stored) => new DomainDetector(stored).resolve(),
  feat: (stored, others) => new FeatDetector(stored, others.classesOf(stored._meta.book)).resolve(),
  item: (stored) => new ItemDetector(stored).resolve(),
  magicItem: (stored) => new MagicItemDetector(stored).resolve(),
  race: (stored) => new RaceDetector(stored).resolve(),
  spell: (stored, others) => new SpellDetector(stored, others.coreSpells()).resolve(),
  wizardSchool: (stored) => new WizardSchoolDetector(stored).resolve(),
};

/** The 3.5 books' references: a folder per book, a JSON file per reference (a class's in the book's `classes/`). */
class References extends ReferenceStore<ReferenceByType> {
  constructor() {
    super(join(import.meta.dirname!, "../../reference"));
  }

  /**
   * A reference with what the generator reads derived from it, uncached, in the shape a reference file has (keys
   * sorted, no undefined values): a feat reference's is derived with its book's classes, which this loads, and a spell
   * reference's with the core rules' spells, as stored.
   */
  override resolve<T extends ReferenceType>(type: T, stored: StoredReference<T>): ReferenceByType[T] {
    const resolveStored: (stored: StoredReference<T>, others: OtherReferences) => ReferenceByType[T] = RESOLVERS[type];
    const others: OtherReferences = {
      classesOf: (book) => this.loadClasses(book),
      coreSpells: () => this.stored(this.path(CORE_BOOK, "spell"), "spell"),
    };
    return JSON.parse(stringifyStably(resolveStored(stored, others)));
  }

  /** Where `book`'s class reference `name` is stored (`classes/wizard.json`), whether or not it exists. */
  classPath(book: string, name: string): string {
    return join(this.dir, book, "classes", `${name}.json`);
  }

  /** `book`'s reference of `type`, loaded (`load`): none when the book has none. */
  find<T extends Exclude<ReferenceType, "class">>(book: string, type: T): ReferenceByType[T] | undefined {
    const path = this.path(book, type);
    return existsSync(path) ? this.load(path, type) : undefined;
  }

  /** A book's class references with their file's name, sorted by it, but those it skips: none for a book without classes. */
  loadClasses(book: string): ClassReferenceFile[] {
    const dir = join(this.dir, book, "classes");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => ({ file, ref: this.load(join(dir, file), "class") }))
      .filter(({ ref }) => !ref.mapping.skip);
  }

  /** Where `book`'s reference of `type` is stored, whether or not the book has one. */
  path(book: string, type: Exclude<ReferenceType, "class">): string {
    return join(this.dir, book, REFERENCE_FILE_NAMES[type]);
  }
}

export default new References();
