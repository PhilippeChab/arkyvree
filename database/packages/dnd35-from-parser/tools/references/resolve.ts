/**
 * A reference file stores what the scraper read (`raw`) and the corrections made by hand (`overrides`), nothing else:
 * re-scraping replaces `raw` and keeps `overrides`. What the generator reads is derived from the two each time a
 * reference is loaded: `detected`, parsed from `raw`, and `mapping`, the entities to generate (items, magic items and
 * spells have only `detected`; wizard schools, neither). The overrides win over both, so a correction takes effect
 * at the next generate and can't be lost to a re-scrape.
 */

import { existsSync, readFileSync } from "node:fs";

import { ClassDetector } from "@/database/packages/dnd35-from-parser/tools/detect/classes/ClassDetector.ts";
import { DomainDetector } from "@/database/packages/dnd35-from-parser/tools/detect/DomainDetector.ts";
import { FeatDetector } from "@/database/packages/dnd35-from-parser/tools/detect/FeatDetector.ts";
import { ItemDetector } from "@/database/packages/dnd35-from-parser/tools/detect/ItemDetector.ts";
import { MagicItemDetector } from "@/database/packages/dnd35-from-parser/tools/detect/MagicItemDetector.ts";
import { RaceDetector } from "@/database/packages/dnd35-from-parser/tools/detect/RaceDetector.ts";
import { SpellDetector } from "@/database/packages/dnd35-from-parser/tools/detect/SpellDetector.ts";
import { stringifyStably } from "@/database/packages/dnd35-from-parser/tools/text/sanitize.ts";
import type { ClassReference, ClassReferenceFile } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { DomainReference } from "@/database/packages/dnd35-from-parser/tools/types/domains.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import type { ItemReference } from "@/database/packages/dnd35-from-parser/tools/types/items.ts";
import type { MagicItemReference } from "@/database/packages/dnd35-from-parser/tools/types/magicItems.ts";
import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";
import type { SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
import type { WizardSchoolReference } from "@/database/packages/dnd35-from-parser/tools/types/wizardSchools.ts";

/** A book's class references (`ReferenceLoader.loadClasses`), which a feat reference's mapping reads. */
export type ClassesOf = (book: string) => ClassReferenceFile[];
export type ReferenceByType = {
  class: ClassReference;
  domain: DomainReference;
  feat: FeatReference;
  item: ItemReference;
  magicItem: MagicItemReference;
  race: RaceReference;
  spell: SpellReference;
  wizardSchool: WizardSchoolReference;
};
export type ReferenceType = keyof ReferenceByType;
/** A reference as it's stored. */
export type StoredReference<T extends ReferenceType = ReferenceType> = Pick<
  ReferenceByType[T],
  "_meta" | "raw" | "overrides"
>;

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
  // Nothing to detect: the reference is as stored
  wizardSchool: (stored) => stored,
};

const STORED_KEYS = new Set(["_meta", "raw", "overrides"]);

/** The overrides of the reference of `type` stored at `path`, which a re-scrape keeps. */
export function readStoredOverrides<T extends ReferenceType>(path: string, type: T): StoredReference<T>["overrides"] {
  return existsSync(path) ? readStoredReference(path, type).overrides : undefined;
}

/**
 * The reference stored at `path`, checked to be of `type` and to store nothing else: anything else (a correction
 * written in `mapping`, say) would be ignored, then lost at the next scrape.
 */
export function readStoredReference<T extends ReferenceType>(path: string, type: T): StoredReference<T> {
  const stored: StoredReference<T> = JSON.parse(readFileSync(path, "utf-8"));
  if (stored._meta.type !== type) throw new Error(`${path} is a ${stored._meta.type} reference, not a ${type} one`);
  const extra = Object.keys(stored).filter((key) => !STORED_KEYS.has(key));
  if (extra.length > 0)
    throw new Error(`${path} stores ${extra.join(", ")}: a reference stores _meta, raw and overrides only`);
  return stored;
}

/**
 * A reference with what the generator reads derived from it, in the shape a reference file has: keys sorted,
 * no undefined values. A feat reference's is derived with its book's classes (`classesOf`).
 */
export function resolveReference<T extends ReferenceType>(
  type: T,
  stored: StoredReference<T>,
  classesOf: ClassesOf,
): ReferenceByType[T] {
  const resolve: (stored: StoredReference<T>, classesOf: ClassesOf) => ReferenceByType[T] = RESOLVERS[type];
  return JSON.parse(stringifyStably(resolve(stored, classesOf)));
}
