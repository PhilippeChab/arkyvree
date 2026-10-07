/**
 * A reference file stores what the scraper read (`raw`) and the corrections made by hand (`overrides`), nothing else:
 * re-scraping replaces `raw` and keeps `overrides`. What the generator reads is derived from the two each time a
 * reference is loaded: `detected`, parsed from `raw`, and `mapping`, the entities to generate (items and magic items
 * have only `detected`; spells and wizard schools, neither). The overrides win over both, so a correction takes effect
 * at the next generate and can't be lost to a re-scrape.
 */

import { existsSync, readFileSync } from "node:fs";

import { buildDetected } from "@/database/packages/dnd35-from-parser/tools/detect/classes/detected.ts";
import {
  buildInitialMapping,
  buildOccurrenceMap,
} from "@/database/packages/dnd35-from-parser/tools/detect/classes/mapping.ts";
import { buildDomainDetected, buildDomainMapping } from "@/database/packages/dnd35-from-parser/tools/detect/domains.ts";
import { buildFeatDetected, buildFeatMapping } from "@/database/packages/dnd35-from-parser/tools/detect/feats.ts";
import { buildItemDetected } from "@/database/packages/dnd35-from-parser/tools/detect/items.ts";
import { buildMagicItemDetected } from "@/database/packages/dnd35-from-parser/tools/detect/magicItems.ts";
import { buildRaceDetected, buildRaceMapping } from "@/database/packages/dnd35-from-parser/tools/detect/races.ts";
import { sanitizeJsonValues, stringifyStably } from "@/database/packages/dnd35-from-parser/tools/text/sanitize.ts";
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
  // A class's mapping: its features as detected, with the overrides applied (a null field removes the detected one).
  class: ({ _meta, raw, overrides }) => {
    const scraped = structuredClone(raw);
    if (overrides?.alignment && !scraped.prerequisites.parsed.alignment)
      scraped.prerequisites.parsed.alignment = overrides.alignment;
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
  },
  feat: ({ _meta, raw, overrides }, classesOf) => {
    const feats = sanitizeJsonValues(raw);
    const detected = buildFeatDetected(feats);
    return {
      _meta,
      raw,
      ...sanitizeJsonValues({
        overrides,
        detected,
        mapping: buildFeatMapping(feats, detected, overrides ?? {}, classesOf(_meta.book)),
      }),
    };
  },
  domain: ({ _meta, raw, overrides }) => {
    const detected = buildDomainDetected(raw);
    return {
      _meta,
      raw,
      ...sanitizeJsonValues({ overrides, detected, mapping: buildDomainMapping(raw, detected, overrides ?? {}) }),
    };
  },
  race: ({ _meta, raw, overrides }) => {
    const races = sanitizeJsonValues(raw);
    const detected = buildRaceDetected(races);
    return {
      _meta,
      raw,
      ...sanitizeJsonValues({ overrides, detected, mapping: buildRaceMapping(races, detected, overrides ?? {}) }),
    };
  },
  item: ({ _meta, raw, overrides }) => ({
    _meta,
    raw,
    ...sanitizeJsonValues({ overrides, detected: buildItemDetected(raw, overrides?.nameMap) }),
  }),
  magicItem: ({ _meta, raw, overrides }) => ({
    _meta,
    raw,
    ...sanitizeJsonValues({ overrides, detected: buildMagicItemDetected(raw) }),
  }),
  // Nothing to derive: the reference is as stored
  spell: (stored) => stored,
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
