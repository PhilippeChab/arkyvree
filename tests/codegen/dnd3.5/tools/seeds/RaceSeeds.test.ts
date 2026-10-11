import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import References from "@/codegen/dnd3.5/tools/references/References.ts";
import Library from "@/codegen/dnd3.5/tools/seeds/Library.ts";
import type { ReferenceType } from "@/codegen/dnd3.5/tools/types/reference.ts";
import { grantLanguage } from "@/content/dnd3.5/builders/languages/knowledge.ts";
import { LANGUAGES } from "@/content/dnd3.5/data/coreRules.ts";
import { SIZE_OPTIONS } from "@/shared/enums.ts";

/** The SRD race `name`'s seeded modifiers on its languages: the grants of those it speaks. */
function grantedBy(name: string) {
  return srdRace(name)?.modifiers?.filter(({ target }) => target.startsWith("languages.")) ?? [];
}

/** A race reference's seeds, as its book makes them. */
function racesOf(reference: ReturnType<typeof stored<"race">>) {
  return Library.book(reference._meta.book).races(References.resolve("race", reference));
}

/** The SRD race `name`, as its book seeds it. */
function srdRace(name: string) {
  return racesOf(stored("srd/races.json", "race"))
    .seeds()
    .find((seed) => seed.name === name);
}

/** A committed reference of `type` as stored. */
function stored<T extends ReferenceType>(file: string, type: T) {
  return structuredClone(References.stored(join(References.dir, file), type));
}

describe("A race reference's races", () => {
  test("leave out the ones its overrides skip", () => {
    const reference = stored("srd/races.json", "race");
    const [skipped] = reference.raw;
    reference.overrides = { ...reference.overrides, [skipped.name]: { skip: true } };
    const names = racesOf(reference)
      .seeds()
      .map(({ name }) => name);
    expect(names).not.toContain(skipped.name);
    expect(names).toHaveLength(reference.raw.length - 1);
  });

  test("have their override's size, else the scraped one, which must be one the seed accepts", () => {
    const reference = stored("srd/races.json", "race");
    // Two races with no size override: the first gets one
    const [first, second] = reference.raw.filter(({ name }) => !reference.overrides?.[name]?.size);
    const size = first.size === "Small" ? "Large" : "Small";
    reference.overrides = { ...reference.overrides, [first.name]: { ...reference.overrides?.[first.name], size } };
    const sizeOf = (name: string) =>
      racesOf(reference)
        .seeded()
        .find((race) => race.name === name)?.size;
    expect(sizeOf(first.name)).toEqual({ ok: true, value: size });
    expect(sizeOf(second.name)).toMatchObject({ ok: true, value: second.size });

    reference.overrides = { ...reference.overrides, [first.name]: { size: "Titanic" } };
    expect(sizeOf(first.name)).toEqual({
      ok: false,
      problem: `${first.name}'s size: "Titanic" isn't one of ${SIZE_OPTIONS.join(", ")}`,
    });
    expect(() => racesOf(reference).seeds()).toThrow(`${first.name}'s size`);
  });
});

describe("A race reference's races' languages", () => {
  test("are grants of those it speaks from the start, after its other modifiers, and none of its bonus languages", () => {
    expect(grantedBy("Dwarf")).toEqual(["Common", "Dwarven"].map((name) => grantLanguage(name)));
    // Its automatic languages, beside a trait its page leaves outside a paragraph: its bonus languages
    expect(grantedBy("Gnome")).toEqual(["Common", "Gnome"].map((name) => grantLanguage(name)));
    expect(grantedBy("Half-Elf")).toEqual(["Common", "Elven"].map((name) => grantLanguage(name)));
    expect(srdRace("Dwarf")?.modifiers?.slice(-2)).toEqual(grantedBy("Dwarf"));
  });

  test("are their overrides' when their page has no traits: the human's and the halfling's, as the SRD gives them", () => {
    expect(grantedBy("Human")).toEqual([grantLanguage("Common")]);
    expect(grantedBy("Halfling")).toEqual(["Common", "Halfling"].map((name) => grantLanguage(name)));
  });

  test("each name a language the core rules seed", () => {
    const known = new Set(LANGUAGES.map(({ name }) => grantLanguage(name).target));
    const named = racesOf(stored("srd/races.json", "race"))
      .seeds()
      .flatMap((race) => race.modifiers ?? [])
      .filter(({ target }) => target.startsWith("languages."));
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter(({ target }) => !known.has(target))).toEqual([]);
  });
});
