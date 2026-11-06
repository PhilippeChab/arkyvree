/**
 * The 5e-bits database's files, read into the book's references: its links stripped, and the entries a reference
 * holds whole gathered under it (a class's levels, features and subclasses; a species' traits and subspecies).
 */

import type {
  ClassEntry,
  ClassFeature,
  ClassLevel,
  Subclass,
  SubclassEntry,
} from "@/codegen/dnd5.2/tools/types/classes.ts";
import type { Ref } from "@/codegen/dnd5.2/tools/types/common.ts";
import type { SpeciesEntry, SubspeciesEntry, TraitEntry } from "@/codegen/dnd5.2/tools/types/species.ts";
import { isRecord } from "@/shared/isRecord.ts";

/** The database's files a class's reference reads. */
interface ClassFiles {
  classes: ClassEntry[];
  features: ClassFeature[];
  levels: ClassLevel[];
  subclasses: SubclassEntry[];
}

/** A class with what its reference gathers under it. */
interface GroupedClass {
  class: ClassEntry;
  features: ClassFeature[];
  levels: ClassLevel[];
  subclasses: Subclass[];
}

/** A species as the database lists it: its traits and subspecies by reference. */
type ListedSpecies = Omit<SpeciesEntry, "subspecies" | "traits"> & { subspecies?: Ref[]; traits: Ref[] };

/** A subspecies as the database lists it: its species, and its traits by reference. */
type ListedSubspecies = Omit<SubspeciesEntry, "traits"> & { species: Ref; traits: Ref[] };

/** A trait as the database lists it: with the species and subspecies that have it, which its reference leaves out. */
type ListedTrait = TraitEntry & { species?: Ref[]; subspecies?: Ref[] };

/** A link of the database's API, a string value naming one of its routes (a class's `class_levels`). */
const API_ROUTE = /^\/api\//;

/** The keys the database links its entries by, which mean nothing past its API: an entry's `url`, an item's `image`. */
const LINK_KEYS = new Set(["image", "url"]);

/** Entries by their slug (`index`). */
function bySlug<T extends { index: string }>(entries: T[]): Map<string, T> {
  return new Map(entries.map((entry) => [entry.index, entry]));
}

/**
 * A class's or a subclass's levels, by level, and its features, by level then name, of `match`: a feature's level is
 * its class's level that gives it (`levelOf`, every level's by its slug), a subclass's feature's too ("fighter-7").
 */
function levelsAndFeatures(
  files: ClassFiles,
  levelOf: Map<string, number>,
  match: (entry: { subclass?: Ref }) => boolean,
) {
  const levels = files.levels.filter(match).toSorted((a, b) => a.level - b.level);
  const features = files.features
    .filter(match)
    .toSorted(
      (a, b) => (levelOf.get(a.level.index) ?? 0) - (levelOf.get(b.level.index) ?? 0) || a.name.localeCompare(b.name),
    );
  return { features, levels };
}

/** The entries of `entries` named by `refs`, in `refs`' order: a reference to none throws, naming it. */
function resolveRefs<T extends { index: string }>(refs: Ref[], entries: Map<string, T>, what: string): T[] {
  return refs.map((ref) => {
    const entry = entries.get(ref.index);
    if (!entry) throw new Error(`No ${what} "${ref.index}" (${ref.name})`);
    return entry;
  });
}

/**
 * Each class with its own levels and features (a subclass's aside), and its subclasses with theirs, in the database's
 * order of classes: a class naming a subclass the database lacks throws.
 */
export function groupClasses(files: ClassFiles): GroupedClass[] {
  const subclasses = bySlug(files.subclasses);
  const levelOf = new Map(files.levels.map((level) => [level.index, level.level]));
  return files.classes.map((klass) => {
    const ofClass = (entry: { class?: Ref; subclass?: Ref }) => entry.class?.index === klass.index;
    const own = levelsAndFeatures(files, levelOf, (entry) => ofClass(entry) && !entry.subclass);
    return {
      class: klass,
      ...own,
      subclasses: resolveRefs(klass.subclasses, subclasses, "subclass").map((subclass) => ({
        subclass,
        ...levelsAndFeatures(files, levelOf, (entry) => ofClass(entry) && entry.subclass?.index === subclass.index),
      })),
    };
  });
}

/**
 * Each species with its traits and its subspecies read whole, each subspecies with its own traits, in the database's
 * order: a reference to a trait or a subspecies the database lacks throws.
 */
export function groupSpecies(species: ListedSpecies[], subspecies: ListedSubspecies[], traits: ListedTrait[]) {
  const traitsBySlug = bySlug(traits);
  const subspeciesBySlug = bySlug(subspecies);
  const resolveTraits = (refs: Ref[]) =>
    resolveRefs(refs, traitsBySlug, "trait").map(
      ({ species: _species, subspecies: _subspecies, ...trait }): TraitEntry => trait,
    );
  return species.map((entry): SpeciesEntry => ({
    ...entry,
    traits: resolveTraits(entry.traits),
    subspecies: resolveRefs(entry.subspecies ?? [], subspeciesBySlug, "subspecies").map(
      ({ species: _species, ...sub }): SubspeciesEntry => ({ ...sub, traits: resolveTraits(sub.traits) }),
    ),
  }));
}

/**
 * A database value without its links (`LINK_KEYS`, and a string naming an API route): what's left is the book's.
 */
export function stripLinks<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => stripLinks(entry)) as T;
  if (!isRecord(value)) return value;
  const entries = Object.entries(value).filter(
    ([key, child]) => !LINK_KEYS.has(key) && !(typeof child === "string" && API_ROUTE.test(child)),
  );
  return Object.fromEntries(entries.map(([key, child]) => [key, stripLinks(child)])) as T;
}
