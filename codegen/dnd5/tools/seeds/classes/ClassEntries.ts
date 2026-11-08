import type {
  ClassEntry,
  ClassFeature,
  ClassLevel,
  ClassReference,
  Subclass,
} from "@/codegen/dnd5/tools/types/classes.ts";

/**
 * A class reference's entries, as its overrides correct them (`{ ...raw, ...overrides[name] }`, by the class's name or
 * a level's): the class, its own levels in order, its features by name, and its subclasses.
 */
export class ClassEntries {
  constructor(readonly ref: ClassReference) {}

  /** `entry` as its override corrects it, by its name: an entry's override corrects its own fields. */
  private corrected<T extends ClassEntry | ClassLevel>(entry: T): T {
    return { ...entry, ...(this.ref.overrides?.[entry.name] as Partial<T> | undefined) };
  }

  /** The class, as its override corrects it. */
  entry(): ClassEntry {
    return this.corrected(this.ref.raw.class);
  }

  /** The class's feature named `name` (its own, no subclass's): a name of none throws. */
  feature(name: string): ClassFeature {
    const feature = this.ref.raw.features.find((entry) => entry.name === name && !entry.subclass);
    if (!feature) throw new Error(`${this.name()}: no feature is "${name}"`);
    return feature;
  }

  /** The class's own levels (no subclass's), in order, each as its override corrects it. */
  levels(): ClassLevel[] {
    return this.ref.raw.levels
      .filter((level) => !level.subclass)
      .map((level) => this.corrected(level))
      .sort((a, b) => a.level - b.level);
  }

  /** The class's name. */
  name(): string {
    return this.ref.raw.class.name;
  }

  /** The class's subclasses, each with its levels and features. */
  subclasses(): Subclass[] {
    return this.ref.raw.subclasses;
  }
}
