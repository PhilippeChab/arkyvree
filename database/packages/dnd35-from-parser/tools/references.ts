import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildDetected, buildInitialMapping, buildOccurrenceMap } from "@/database/packages/dnd35-from-parser/tools/scraper/detectClass.ts";
import { buildDomainDetected, buildDomainMapping } from "@/database/packages/dnd35-from-parser/tools/scraper/detectDomain.ts";
import { buildFeatDetected, buildFeatMapping } from "@/database/packages/dnd35-from-parser/tools/scraper/detectFeat.ts";
import { buildItemDetected } from "@/database/packages/dnd35-from-parser/tools/scraper/detectItem.ts";
import { buildMagicItemDetected } from "@/database/packages/dnd35-from-parser/tools/scraper/detectMagicItem.ts";
import { buildRaceDetected, buildRaceMapping } from "@/database/packages/dnd35-from-parser/tools/scraper/detectRace.ts";
import { sanitizeJsonValues, stableStringify } from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";
import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import type {
  ClassReference,
  DomainReference,
  FeatReference,
  ItemReference,
  MagicItemReference,
  RaceReference,
  SpellReference,
  WizardSchoolReference,
} from "@/database/packages/dnd35-from-parser/tools/types.ts";

// A reference file stores what the scraper read (`raw`) and the corrections made by hand (`overrides`), nothing
// else: re-scraping replaces `raw` and keeps `overrides`. What the generator reads is derived from the two each time
// a reference is loaded: `detected`, parsed from `raw`, and `mapping`, the entities to generate (items and magic
// items have only `detected`; spells and wizard schools, neither). The overrides win over both, so a correction
// takes effect at the next generate and can't be lost to a re-scrape.

export type ReferenceByType = {
  class: ClassReference;
  feat: FeatReference;
  spell: SpellReference;
  domain: DomainReference;
  race: RaceReference;
  item: ItemReference;
  magicItem: MagicItemReference;
  wizardSchool: WizardSchoolReference;
};
export type ReferenceType = keyof ReferenceByType;
/** A reference as it's stored. */
export type StoredReference<T extends ReferenceType = ReferenceType> = Pick<ReferenceByType[T], "_meta" | "raw" | "overrides">;

/** A class's mapping: its features as detected, with the overrides applied (a null field removes the detected one). */
function resolveClass({ _meta, raw, overrides }: StoredReference<"class">): ClassReference {
  const scraped = structuredClone(raw);
  if (overrides?.alignment && !scraped.prerequisites.parsed.alignment) scraped.prerequisites.parsed.alignment = overrides.alignment;
  const detected = buildDetected(scraped);
  const mapping = buildInitialMapping(scraped, detected);
  if (overrides?.noSpells) {
    delete mapping.spells;
    delete mapping.bonusSpellAbility;
  }
  for (const [name, fields] of Object.entries(overrides?.features ?? {})) {
    const feature: Record<string, unknown> = Object.assign(mapping.features[name] ?? {}, fields);
    for (const [key, value] of Object.entries(feature)) if (value === null) delete feature[key];
    mapping.features[name] = feature;
  }
  mapping.occurrenceMap = buildOccurrenceMap(mapping.features, detected.featureOccurrences);
  return { _meta, raw: scraped, ...sanitizeJsonValues({ overrides, detected, mapping }) };
}

const RESOLVERS: { [T in ReferenceType]: (stored: StoredReference<T>) => ReferenceByType[T] } = {
  class: resolveClass,
  feat: ({ _meta, raw, overrides }) => {
    const feats = sanitizeJsonValues(raw);
    const detected = buildFeatDetected(feats);
    return { _meta, raw, ...sanitizeJsonValues({ overrides, detected, mapping: buildFeatMapping(feats, detected, overrides ?? {}, _meta.book) }) };
  },
  domain: ({ _meta, raw, overrides }) => {
    const detected = buildDomainDetected(raw);
    return { _meta, raw, ...sanitizeJsonValues({ overrides, detected, mapping: buildDomainMapping(raw, detected, overrides ?? {}) }) };
  },
  race: ({ _meta, raw, overrides }) => {
    const races = sanitizeJsonValues(raw);
    const detected = buildRaceDetected(races);
    return { _meta, raw, ...sanitizeJsonValues({ overrides, detected, mapping: buildRaceMapping(races, detected, overrides ?? {}) }) };
  },
  item: ({ _meta, raw, overrides }) => ({ _meta, raw, ...sanitizeJsonValues({ overrides, detected: buildItemDetected(raw, overrides?.nameMap) }) }),
  magicItem: ({ _meta, raw, overrides }) => ({ _meta, raw, ...sanitizeJsonValues({ overrides, detected: buildMagicItemDetected(raw) }) }),
  // Nothing to derive: the reference is as stored
  spell: (stored) => stored,
  wizardSchool: (stored) => stored,
};

/**
 * A reference with what the generator reads derived from it, in the shape a reference file has: keys sorted,
 * no undefined values.
 */
export function resolveReference<T extends ReferenceType>(type: T, stored: StoredReference<T>): ReferenceByType[T] {
  const resolve: (stored: StoredReference<T>) => ReferenceByType[T] = RESOLVERS[type];
  return JSON.parse(stableStringify(resolve(stored)));
}

const STORED_KEYS = new Set(["_meta", "raw", "overrides"]);

/**
 * The reference stored at `path`, checked to be of `type` and to store nothing else: anything else (a correction
 * written in `mapping`, say) would be ignored, then lost at the next scrape.
 */
export function readStoredReference<T extends ReferenceType>(path: string, type: T): StoredReference<T> {
  const stored: StoredReference<T> = JSON.parse(readFileSync(path, "utf-8"));
  if (stored._meta.type !== type) throw new Error(`${path} is a ${stored._meta.type} reference, not a ${type} one`);
  const extra = Object.keys(stored).filter((key) => !STORED_KEYS.has(key));
  if (extra.length > 0) throw new Error(`${path} stores ${extra.join(", ")}: a reference stores _meta, raw and overrides only`);
  return stored;
}

/** Freezes a value and everything in it. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const loaded: { [T in ReferenceType]: Map<string, ReferenceByType[T]> } = {
  class: new Map(), feat: new Map(), spell: new Map(), domain: new Map(), race: new Map(), item: new Map(), magicItem: new Map(), wizardSchool: new Map(),
};

/**
 * Loads a reference of `type`, with what the generator reads derived from it. A process loads each file once (the
 * generator reads the same references many times, and writes none). The reference is shared, so it's frozen:
 * changing it throws. Its type stays mutable, as the generator's functions and the content types take mutable data.
 */
export function loadReference<T extends ReferenceType>(path: string, type: T): ReferenceByType[T] {
  const cache: Map<string, ReferenceByType[T]> = loaded[type];
  const key = resolve(path);
  const cached = cache.get(key);
  if (cached) return cached;
  const reference = deepFreeze(resolveReference(type, readStoredReference(key, type)));
  cache.set(key, reference);
  return reference;
}

/** A book's class references with their file's name, in the order its folder lists them: none for a book without classes. */
export function classReferences(book: string): { file: string; ref: ClassReference }[] {
  const dir = join(REFERENCE_DIR, book, "classes");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((file) => file.endsWith(".json")).map((file) => ({ file, ref: loadReference(join(dir, file), "class") }));
}

/** The overrides of the reference of `type` stored at `path`, which a re-scrape keeps. */
export function storedOverrides<T extends ReferenceType>(path: string, type: T): StoredReference<T>["overrides"] {
  return existsSync(path) ? readStoredReference(path, type).overrides : undefined;
}
