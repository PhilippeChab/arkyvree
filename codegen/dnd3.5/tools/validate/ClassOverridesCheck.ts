import { ClassFiles } from "@/codegen/dnd3.5/tools/generator/ClassFiles.ts";
import References from "@/codegen/dnd3.5/tools/references/References.ts";
import Library from "@/codegen/dnd3.5/tools/seeds/Library.ts";
import { sortKeysDeep } from "@/codegen/dnd3.5/tools/text/json.ts";
import type { ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";
import type { StoredReference } from "@/codegen/dnd3.5/tools/types/reference.ts";

type ClassOverrides = NonNullable<StoredReference<"class">["overrides"]>;

/** Two values alike: nothing, null and an empty list all mean nothing. */
function alike(a: unknown, b: unknown) {
  const normal = (value: unknown) =>
    value === null || (Array.isArray(value) && value.length === 0) ? undefined : sortKeysDeep(value);
  return JSON.stringify(normal(a)) === JSON.stringify(normal(b));
}

/**
 * What the generator writes for a class (`ClassFiles`: what's left to review in it, its class file and its feats
 * file), or why it refuses the class.
 */
function generated(ref: ClassReference): string | Error {
  try {
    return new ClassFiles(Library.book(ref._meta.book).classes(ref))
      .files()
      .flatMap(({ notes, code }) => [...notes, code])
      .join("\n");
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * What `parser:validate` checks of a class's overrides:
 * - `refusal`: why the generator refuses the class, if it does (then nothing else is checked);
 * - `redundant`: overrides that change nothing. Each (a field of a feature or spells override, or another override)
 *   holds what's derived without it, and the class's generated files come out the same without it. One that differs
 *   from what's derived stays even when nothing uses it today: another change can bring the correction into play.
 *   `bonusFeatLists` and `spells.inheritsFrom` shape the book's copied feats and spells, and `reviewed` what
 *   `parser:validate` reports, so none is checked;
 * - `ignored`: overrides the generator never applies. Spells, when none were detected (or `noSpells` removed them),
 *   `noSpells` itself then, and an alignment where the page gives one.
 */
export class ClassOverridesCheck {
  constructor(stored: StoredReference<"class">) {
    this.stored = stored;
    this.overrides = stored.overrides ?? {};
    this.withAll = this.resolve(this.overrides);
    this.output = generated(this.withAll);
  }

  /** What the generator writes for the class with all its overrides, or why it refuses it. */
  private readonly output: string | Error;
  /** The class's overrides. */
  private readonly overrides: ClassOverrides;
  /** The class with all its overrides. */
  private readonly withAll: ClassReference;
  /** The class's reference, as stored. */
  readonly stored: StoredReference<"class">;

  /** Whether `ref` (the class without an override) is generated as the class is, its override holding the same. */
  private generatesTheSame(ref: ClassReference, holdsTheSame: boolean): boolean {
    return holdsTheSame && generated(ref) === this.output;
  }

  /** The fields of its features' overrides that change nothing: each holds what's derived for it. */
  private redundantFeatureFields(): string[] {
    const { features = {} } = this.overrides;
    // A feature's field without its override is what's derived for it, whichever other feature override is left out:
    // one resolve gives them all, and only a field holding it is resolved without its override and generated again
    const derivedFeatures = this.resolve({ ...this.overrides, features: {} }).mapping.features;
    return Object.entries(features).flatMap(([name, fields]) =>
      Object.keys(fields)
        .filter(
          (key) =>
            alike(
              Reflect.get(this.withAll.mapping.features[name] ?? {}, key),
              Reflect.get(derivedFeatures[name] ?? {}, key),
            ) &&
            generated(
              this.without((copy) => copy.features?.[name] && Reflect.deleteProperty(copy.features[name], key)),
            ) === this.output,
        )
        .map((key) => `features.${name}.${key}`),
    );
  }

  /** The overrides other than the features', the spells' and those not checked that change nothing. */
  private redundantOverrides(): string[] {
    const {
      features: _features,
      spells: _spells,
      bonusFeatLists: _bonusFeatLists,
      reviewed: _reviewed,
      ...rest
    } = this.overrides;
    return Object.keys(rest).filter((key) => {
      const ref = this.without((copy) => Reflect.deleteProperty(copy, key));
      const derived = [ref.mapping, ref.detected, ref.raw]
        .map((part) => Reflect.get(part, key))
        .find((value) => value !== undefined);
      return this.generatesTheSame(ref, alike(Reflect.get(this.withAll.overrides ?? {}, key), derived));
    });
  }

  /** The fields of its spells override that change nothing, but the lists it inherits: none without spells. */
  private redundantSpellFields(): string[] {
    if (!this.withAll.mapping.spells) return [];
    const { inheritsFrom: _inheritsFrom, ...spellFields } = this.overrides.spells ?? {};
    return Object.keys(spellFields)
      .filter((key) => {
        const ref = this.without((copy) => copy.spells && Reflect.deleteProperty(copy.spells, key));
        return this.generatesTheSame(
          ref,
          alike(Reflect.get(this.withAll.mapping.spells ?? {}, key), Reflect.get(ref.mapping.spells ?? {}, key)),
        );
      })
      .map((key) => `spells.${key}`);
  }

  /** The class with `rest` as its overrides. */
  private resolve(rest: ClassOverrides): ClassReference {
    return References.resolve("class", { _meta: this.stored._meta, raw: this.stored.raw, overrides: rest });
  }

  /** The class without what `remove` takes out of a copy of its overrides. */
  private without(remove: (rest: ClassOverrides) => void): ClassReference {
    const rest = structuredClone(this.overrides);
    remove(rest);
    return this.resolve(rest);
  }

  /** The overrides the generator never applies: none for a class it refuses. */
  ignored(): string[] {
    if (this.output instanceof Error) return [];
    const { spells = {} } = this.overrides;
    const detectedSpells = this.resolve({}).mapping.spells;
    return [
      ...(Object.keys(spells).length > 0 && !this.withAll.mapping.spells ? ["spells"] : []),
      ...(this.overrides.noSpells && !detectedSpells ? ["noSpells"] : []),
      ...(this.overrides.alignment && this.stored.raw.prerequisites.parsed.alignment ? ["alignment"] : []),
    ];
  }

  /** The overrides that change nothing: none for a class the generator refuses. */
  redundant(): string[] {
    if (this.output instanceof Error) return [];
    return [...this.redundantOverrides(), ...this.redundantSpellFields(), ...this.redundantFeatureFields()];
  }

  /** Why the generator refuses the class, if it does. */
  refusal(): string | undefined {
    return this.output instanceof Error ? this.output.message : undefined;
  }
}
