import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";
import { checkOneOf } from "@/database/packages/dnd35-from-parser/tools/seeds/checks.ts";
import { buildRaceSeeds, getSeededRaces } from "@/database/packages/dnd35-from-parser/tools/seeds/races.ts";
import type { ReferenceType } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";
import { SIZE_OPTIONS } from "@/shared/enums.ts";

/** A committed reference of `type` as stored. */
function stored<T extends ReferenceType>(file: string, type: T) {
  return structuredClone(References.stored(join(References.dir, file), type));
}

describe("A race reference's races", () => {
  test("leave out the ones its overrides skip", () => {
    const reference = stored("srd/races.json", "race");
    const [skipped] = reference.raw;
    reference.overrides = { ...reference.overrides, [skipped.name]: { skip: true } };
    const names = buildRaceSeeds(References.resolve("race", reference)).map(({ name }) => name);
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
      getSeededRaces(References.resolve("race", reference)).find((race) => race.name === name)?.size;
    expect(sizeOf(first.name)).toEqual({ ok: true, value: size });
    expect(sizeOf(second.name)).toEqual(checkOneOf(second.size, SIZE_OPTIONS, `${second.name}'s size`));

    reference.overrides = { ...reference.overrides, [first.name]: { size: "Titanic" } };
    expect(sizeOf(first.name)).toEqual({
      ok: false,
      problem: `${first.name}'s size: "Titanic" isn't one of ${SIZE_OPTIONS.join(", ")}`,
    });
    expect(() => buildRaceSeeds(References.resolve("race", reference))).toThrow(`${first.name}'s size`);
  });
});
