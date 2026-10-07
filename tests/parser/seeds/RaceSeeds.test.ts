import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import References from "@/codegen/dnd3.5/tools/references/References.ts";
import Library from "@/codegen/dnd3.5/tools/seeds/Library.ts";
import type { ReferenceType } from "@/codegen/dnd3.5/tools/types/reference.ts";
import { SIZE_OPTIONS } from "@/shared/enums.ts";

/** A race reference's seeds, as its book makes them. */
function racesOf(reference: ReturnType<typeof stored<"race">>) {
  return Library.book(reference._meta.book).races(References.resolve("race", reference));
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
