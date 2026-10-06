/** The references a process loads, each file once: the generator reads the same references many times. */

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import {
  readStoredReference,
  type ReferenceByType,
  type ReferenceType,
  resolveReference,
} from "@/database/packages/dnd35-from-parser/tools/references.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";

/** Freezes a value and everything in it. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Loads references: a reference once per process, with what the generator reads derived from it, and frozen. */
class ReferenceLoader {
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
    const reference = deepFreeze(resolveReference(type, readStoredReference(key, type)));
    cache.set(key, reference);
    return reference;
  }

  /** A book's class references with their file's name, sorted by it: none for a book without classes. */
  loadClasses(book: string): { file: string; ref: ClassReference }[] {
    const dir = join(REFERENCE_DIR, book, "classes");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => ({ file, ref: this.load(join(dir, file), "class") }))
      .filter(({ ref }) => !ref.overrides?.skip);
  }
}

export default new ReferenceLoader();
