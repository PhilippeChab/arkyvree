import { getClassFeatsFile } from "@/database/packages/dnd35-from-parser/tools/generator/bookLayout.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
import { sortKeysDeep } from "@/database/packages/dnd35-from-parser/tools/text/json.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { StoredReference } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";

import { getClassReviewNotes } from "./classReview.ts";

type ClassOverrides = NonNullable<StoredReference<"class">["overrides"]>;

/** Two values alike: nothing, null and an empty list all mean nothing. */
function alike(a: unknown, b: unknown) {
  const normal = (value: unknown) =>
    value === null || (Array.isArray(value) && value.length === 0) ? undefined : sortKeysDeep(value);
  return JSON.stringify(normal(a)) === JSON.stringify(normal(b));
}

/**
 * What the generator writes for a class (what's left to review in it, its class file and its feats file), or why it
 * refuses the class.
 */
function generated(ref: ClassReference): string | Error {
  try {
    const seeds = Library.book(ref._meta.book);
    const classFile = new CodeFile();
    classFile.classSeed(seeds.classes(ref).seed());
    const featsFile = new CodeFile();
    featsFile.list(
      getClassFeatsFile(ref.raw.name).list,
      "FeatSeed",
      seeds
        .classes(ref)
        .feats()
        .flatMap((feat) => featsFile.feat(feat)),
    );
    return [...getClassReviewNotes(ref), classFile.code(), featsFile.code()].join("\n");
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
export function checkClassOverrides(stored: StoredReference<"class">): {
  ignored: string[];
  redundant: string[];
  refusal?: string;
} {
  const overrides = stored.overrides ?? {};
  const resolve = (rest: ClassOverrides) =>
    References.resolve("class", { _meta: stored._meta, raw: stored.raw, overrides: rest });
  const withAll = resolve(overrides);
  const output = generated(withAll);
  if (output instanceof Error) return { refusal: output.message, redundant: [], ignored: [] };

  const without = (remove: (rest: ClassOverrides) => void) => {
    const rest = structuredClone(overrides);
    remove(rest);
    return resolve(rest);
  };
  const redundant = (ref: ClassReference, holdsTheSame: boolean) => holdsTheSame && generated(ref) === output;

  const { features = {}, spells = {}, bonusFeatLists: _bonusFeatLists, reviewed: _reviewed, ...rest } = overrides;
  const { inheritsFrom: _inheritsFrom, ...spellFields } = spells;
  const detectedSpells = resolve({}).mapping.spells;
  // A feature's field without its override is what's derived for it, whichever other feature override is left out:
  // one resolve gives them all, and only a field holding it is resolved without its override and generated again
  const derivedFeatures = resolve({ ...overrides, features: {} }).mapping.features;
  return {
    redundant: [
      ...Object.keys(rest).filter((key) => {
        const ref = without((copy) => Reflect.deleteProperty(copy, key));
        const derived = [ref.mapping, ref.detected, ref.raw]
          .map((part) => Reflect.get(part, key))
          .find((value) => value !== undefined);
        return redundant(ref, alike(Reflect.get(withAll.overrides ?? {}, key), derived));
      }),
      ...(withAll.mapping.spells
        ? Object.keys(spellFields)
            .filter((key) => {
              const ref = without((copy) => copy.spells && Reflect.deleteProperty(copy.spells, key));
              return redundant(
                ref,
                alike(Reflect.get(withAll.mapping.spells ?? {}, key), Reflect.get(ref.mapping.spells ?? {}, key)),
              );
            })
            .map((key) => `spells.${key}`)
        : []),
      ...Object.entries(features).flatMap(([name, fields]) =>
        Object.keys(fields)
          .filter(
            (key) =>
              alike(
                Reflect.get(withAll.mapping.features[name] ?? {}, key),
                Reflect.get(derivedFeatures[name] ?? {}, key),
              ) &&
              generated(
                without((copy) => copy.features?.[name] && Reflect.deleteProperty(copy.features[name], key)),
              ) === output,
          )
          .map((key) => `features.${name}.${key}`),
      ),
    ],
    ignored: [
      ...(Object.keys(spells).length > 0 && !withAll.mapping.spells ? ["spells"] : []),
      ...(overrides.noSpells && !detectedSpells ? ["noSpells"] : []),
      ...(overrides.alignment && stored.raw.prerequisites.parsed.alignment ? ["alignment"] : []),
    ],
  };
}
