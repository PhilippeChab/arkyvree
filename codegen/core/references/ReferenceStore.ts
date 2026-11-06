/**
 * A ruleset's parser's references, on disk and as loaded: a folder per book, a JSON file per reference. A reference
 * file stores what the scraper read (`raw`) and the corrections made by hand (`overrides`), nothing else: re-scraping
 * replaces `raw` and keeps `overrides`. What a ruleset's parser reads past them it derives each time a reference is
 * loaded (`resolve`), so a correction takes effect at the next load and can't be lost to a re-scrape.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { sortKeysDeep, stringifyStably } from "@/codegen/core/text/json.ts";
import { isRecord } from "@/shared/isRecord.ts";

import type { ReferenceFile, ReferenceFilters, Stored, StoredShape } from "./types.ts";

/** What a reference file's `_meta` says of it (a reference read from several pages names none of them). */
interface FileMeta<T extends string> {
  _meta: { book: string; sourceUrl?: string; type: T };
}

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
 * A ruleset's parser's references, by their types (`ByType`: each type's reference as loaded): found, read, written
 * and loaded alike for every ruleset. A ruleset's store says where a book's reference of each type is and what loading
 * one derives (`resolve`). A process loads each file once, as a generator reads the same references many times.
 */
export abstract class ReferenceStore<ByType extends { [T in keyof ByType & string]: StoredShape<T> }> {
  /** `dir`: the books' references, a folder per book. */
  constructor(readonly dir: string) {}

  /** The references loaded, by type and file. */
  private readonly loaded = new Map<string, unknown>();

  /** A reference of `type` with what loading it derives, uncached, as stored by its file (`stored`). */
  abstract resolve<T extends keyof ByType & string>(type: T, stored: Stored<ByType[T]>): ByType[T];

  /** The books with references: the folders of `dir` (a symlinked one too), sorted, so a run is the same on every filesystem. */
  books(): string[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() || (entry.isSymbolicLink() && statSync(join(this.dir, entry.name)).isDirectory()),
      )
      .map((entry) => entry.name)
      .sort();
  }

  /** The reference file at `path`: the type, page and book its `_meta` names. */
  file(path: string): ReferenceFile<keyof ByType & string> {
    const { _meta }: FileMeta<keyof ByType & string> = JSON.parse(readFileSync(path, "utf-8"));
    return { path, type: _meta.type, url: _meta.sourceUrl, book: _meta.book };
  }

  /**
   * The reference files, each book's, sorted by path: those `filters` select, when given (a book's, a type's, the file
   * a name names).
   */
  files({ bookFilter, typeFilter, nameFilter }: ReferenceFilters = {}): ReferenceFile<keyof ByType & string>[] {
    if (!existsSync(this.dir)) return [];
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

  /**
   * Loads a reference of `type`, with what loading it derives (`resolve`). A process loads each file once. The
   * reference is shared, so it's frozen: changing it throws. Its type stays mutable, as what reads it takes mutable
   * data.
   */
  load<T extends keyof ByType & string>(path: string, type: T): ByType[T] {
    const key = `${type}:${resolve(path)}`;
    if (this.loaded.has(key)) return this.loaded.get(key) as ByType[T];
    const reference = deepFreeze(this.resolve(type, this.stored(resolve(path), type)));
    this.loaded.set(key, reference);
    return reference;
  }

  /** The overrides of the reference of `type` stored at `path`, which a re-scrape keeps: none without a file. */
  overrides<T extends keyof ByType & string>(path: string, type: T): Stored<ByType[T]>["overrides"] {
    return existsSync(path) ? this.stored(path, type).overrides : undefined;
  }

  /**
   * The reference stored at `path`, checked to be of `type` and to store nothing else: anything else (a correction
   * written past its overrides, say) would be ignored, then lost at the next scrape.
   */
  stored<T extends keyof ByType & string>(path: string, type: T): Stored<ByType[T]> {
    const stored: Stored<ByType[T]> = JSON.parse(readFileSync(path, "utf-8"));
    if (stored._meta.type !== type) throw new Error(`${path} is a ${stored._meta.type} reference, not a ${type} one`);
    const extra = Object.keys(stored).filter((key) => !STORED_KEYS.has(key));
    if (extra.length > 0)
      throw new Error(`${path} stores ${extra.join(", ")}: a reference stores _meta, raw and overrides only`);
    return stored;
  }

  /** Writes a stored reference to `path`, unless all that changed is when it was scraped: whether it wrote it. */
  write(path: string, stored: Stored<StoredShape>): boolean {
    if (existsSync(path) && withoutScrapedAt(stored) === withoutScrapedAt(JSON.parse(readFileSync(path, "utf-8"))))
      return false;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, stringifyStably(stored));
    return true;
  }
}
