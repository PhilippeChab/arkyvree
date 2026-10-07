/**
 * The books' references, on disk and as loaded. A reference file stores what the scraper read (`raw`) and the
 * corrections made by hand (`overrides`), nothing else: re-scraping replaces `raw` and keeps `overrides`. What the
 * generator reads is derived from the two each time a reference is loaded, by its kind's detector: `detected`, parsed
 * from `raw` (wizard schools have none), and `mapping`, each entity as the seeds make it, its overrides applied. The
 * overrides win over both, so a correction takes effect at the next generate and can't be lost to a re-scrape.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { ClassDetector } from "@/database/packages/dnd35-from-parser/tools/detect/classes/ClassDetector.ts";
import { DomainDetector } from "@/database/packages/dnd35-from-parser/tools/detect/DomainDetector.ts";
import { FeatDetector } from "@/database/packages/dnd35-from-parser/tools/detect/FeatDetector.ts";
import { ItemDetector } from "@/database/packages/dnd35-from-parser/tools/detect/ItemDetector.ts";
import { MagicItemDetector } from "@/database/packages/dnd35-from-parser/tools/detect/MagicItemDetector.ts";
import { RaceDetector } from "@/database/packages/dnd35-from-parser/tools/detect/RaceDetector.ts";
import { SpellDetector } from "@/database/packages/dnd35-from-parser/tools/detect/SpellDetector.ts";
import { WizardSchoolDetector } from "@/database/packages/dnd35-from-parser/tools/detect/WizardSchoolDetector.ts";
import { sortKeysDeep, stringifyStably } from "@/database/packages/dnd35-from-parser/tools/text/json.ts";
import type { ClassReferenceFile } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type {
  ReferenceByType,
  ReferenceFile,
  ReferenceFilters,
  ReferenceType,
  StoredReference,
} from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";
import { isRecord } from "@/shared/isRecord.ts";

/** A book's class references, which a feat reference's mapping reads. */
type ClassesOf = (book: string) => ClassReferenceFile[];

/** What a reference file's `_meta` says of it (an item reference names its pages, not one). */
type FileMeta = { _meta: { book: string; sourceUrl?: string; type: ReferenceType } };

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
  [T in ReferenceType]: (stored: StoredReference<T>, classesOf: ClassesOf) => ReferenceByType[T];
} = {
  class: (stored) => new ClassDetector(stored).resolve(),
  domain: (stored) => new DomainDetector(stored).resolve(),
  feat: (stored, classesOf) => new FeatDetector(stored, classesOf(stored._meta.book)).resolve(),
  item: (stored) => new ItemDetector(stored).resolve(),
  magicItem: (stored) => new MagicItemDetector(stored).resolve(),
  race: (stored) => new RaceDetector(stored).resolve(),
  spell: (stored) => new SpellDetector(stored).resolve(),
  wizardSchool: (stored) => new WizardSchoolDetector(stored).resolve(),
};

/** What a reference file stores. */
const STORED_KEYS = new Set(["_meta", "raw", "overrides"]);

/** Freezes a value and everything in it. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** A stored reference as JSON, without when it was scraped: what a re-scrape compares. */
function withoutScrapedAt(stored: unknown): string {
  const copy = structuredClone(sortKeysDeep(stored));
  if (isRecord(copy) && isRecord(copy._meta)) delete copy._meta.scrapedAt;
  return JSON.stringify(copy);
}

/**
 * The books' references: a folder per book, a JSON file per reference (a class's in the book's `classes/`). A process
 * loads each file once, as the generator reads the same references many times.
 */
class References {
  /** The references loaded, by type and file. */
  private readonly loaded: { [T in ReferenceType]: Map<string, ReferenceByType[T]> } = {
    class: new Map(),
    feat: new Map(),
    spell: new Map(),
    domain: new Map(),
    race: new Map(),
    item: new Map(),
    magicItem: new Map(),
    wizardSchool: new Map(),
  };
  /** The books' references: a folder per book. */
  readonly dir = join(import.meta.dirname!, "../../reference");

  /** The books with references: the folders of `dir` (a symlinked one too), sorted, so generation is the same on every filesystem. */
  books(): string[] {
    return readdirSync(this.dir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() || (entry.isSymbolicLink() && statSync(join(this.dir, entry.name)).isDirectory()),
      )
      .map((entry) => entry.name)
      .sort();
  }

  /** Where `book`'s class reference `name` is stored (`classes/wizard.json`), whether or not it exists. */
  classPath(book: string, name: string): string {
    return join(this.dir, book, "classes", `${name}.json`);
  }

  /** The reference file at `path`: the type, page and book its `_meta` names. */
  file(path: string): ReferenceFile {
    const { _meta }: FileMeta = JSON.parse(readFileSync(path, "utf-8"));
    return { path, type: _meta.type, url: _meta.sourceUrl, book: _meta.book };
  }

  /**
   * The reference files, each book's, sorted by path: those `filters` select, when given (a book's, a type's, the file
   * a name names).
   */
  files({ bookFilter, typeFilter, nameFilter }: ReferenceFilters = {}): ReferenceFile[] {
    return readdirSync(this.dir, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(entry.parentPath, entry.name))
      .sort()
      .map((path) => this.file(path))
      .filter(
        (ref) =>
          (!bookFilter || ref.book === bookFilter) &&
          (!typeFilter || ref.type === typeFilter) &&
          (!nameFilter || basename(ref.path, ".json").toLowerCase() === nameFilter),
      );
  }

  /** `book`'s reference of `type`, loaded (`load`): none when the book has none. */
  find<T extends Exclude<ReferenceType, "class">>(book: string, type: T): ReferenceByType[T] | undefined {
    const path = this.path(book, type);
    return existsSync(path) ? this.load(path, type) : undefined;
  }

  /**
   * Loads a reference of `type`, with what the generator reads derived from it. A process loads each file once (the
   * generator reads the same references many times, and writes none). The reference is shared, so it's frozen:
   * changing it throws. Its type stays mutable, as the generator's functions and the content types take mutable data.
   */
  load<T extends ReferenceType>(path: string, type: T): ReferenceByType[T] {
    const cache: Map<string, ReferenceByType[T]> = this.loaded[type];
    const key = resolve(path);
    const cached = cache.get(key);
    if (cached) return cached;
    const reference = deepFreeze(this.resolve(type, this.stored(key, type)));
    cache.set(key, reference);
    return reference;
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

  /** The overrides of the reference of `type` stored at `path`, which a re-scrape keeps: none without a file. */
  overrides<T extends ReferenceType>(path: string, type: T): StoredReference<T>["overrides"] {
    return existsSync(path) ? this.stored(path, type).overrides : undefined;
  }

  /** Where `book`'s reference of `type` is stored, whether or not the book has one. */
  path(book: string, type: Exclude<ReferenceType, "class">): string {
    return join(this.dir, book, REFERENCE_FILE_NAMES[type]);
  }

  /**
   * A reference with what the generator reads derived from it, uncached, in the shape a reference file has (keys
   * sorted, no undefined values): a feat reference's is derived with its book's classes, which this loads.
   */
  resolve<T extends ReferenceType>(type: T, stored: StoredReference<T>): ReferenceByType[T] {
    const resolveStored: (stored: StoredReference<T>, classesOf: ClassesOf) => ReferenceByType[T] = RESOLVERS[type];
    return JSON.parse(stringifyStably(resolveStored(stored, (book) => this.loadClasses(book))));
  }

  /**
   * The reference stored at `path`, checked to be of `type` and to store nothing else: anything else (a correction
   * written in `mapping`, say) would be ignored, then lost at the next scrape.
   */
  stored<T extends ReferenceType>(path: string, type: T): StoredReference<T> {
    const stored: StoredReference<T> = JSON.parse(readFileSync(path, "utf-8"));
    if (stored._meta.type !== type) throw new Error(`${path} is a ${stored._meta.type} reference, not a ${type} one`);
    const extra = Object.keys(stored).filter((key) => !STORED_KEYS.has(key));
    if (extra.length > 0)
      throw new Error(`${path} stores ${extra.join(", ")}: a reference stores _meta, raw and overrides only`);
    return stored;
  }

  /** Writes a stored reference to `path`, unless all that changed is when it was scraped: whether it wrote it. */
  write(path: string, stored: StoredReference): boolean {
    if (existsSync(path) && withoutScrapedAt(stored) === withoutScrapedAt(JSON.parse(readFileSync(path, "utf-8"))))
      return false;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, stringifyStably(stored));
    return true;
  }
}

export default new References();
