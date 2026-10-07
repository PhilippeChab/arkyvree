import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";
import {
  buildMagicItemSeeds,
  getSeededMagicItems,
} from "@/database/packages/dnd35-from-parser/tools/seeds/magicItems.ts";
import type { ReferenceType } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";
import { LOCATION_OPTIONS } from "@/shared/enums.ts";

/** A committed reference of `type` as stored. */
function stored<T extends ReferenceType>(file: string, type: T) {
  return structuredClone(References.stored(join(References.dir, file), type));
}

describe("A magic item reference's items", () => {
  test("leave out the ones its overrides skip, and have their override's slot, else the detected one", () => {
    const reference = stored("srd/magicItems.json", "magicItem");
    const loaded = References.resolve("magicItem", reference);
    const [skipped, slotted] = Object.keys(loaded.detected).filter((name) => !reference.overrides?.[name]);
    // A slot the item isn't detected with
    const slot = LOCATION_OPTIONS.find((option) => option !== loaded.detected[slotted].slot) ?? "Waist";
    reference.overrides = { ...reference.overrides, [skipped]: { skip: true }, [slotted]: { slot } };
    const items = getSeededMagicItems(References.resolve("magicItem", reference));
    expect(items.map(({ name }) => name)).not.toContain(skipped);
    expect(items.find(({ name }) => name === slotted)?.slot).toEqual({ ok: true, value: slot });

    // An empty slot is no slot, not a refused one
    reference.overrides = { ...reference.overrides, [slotted]: { slot: "" } };
    expect(
      getSeededMagicItems(References.resolve("magicItem", reference)).find(({ name }) => name === slotted)?.slot,
    ).toBeUndefined();
    expect(() => buildMagicItemSeeds(References.resolve("magicItem", reference))).not.toThrow();

    reference.overrides = { ...reference.overrides, [slotted]: { slot: "Tail" } };
    const refused = getSeededMagicItems(References.resolve("magicItem", reference)).find(
      ({ name }) => name === slotted,
    )?.slot;
    expect(refused).toEqual({
      ok: false,
      problem: `${slotted}'s slot: "Tail" isn't one of ${LOCATION_OPTIONS.join(", ")}`,
    });
    expect(() => buildMagicItemSeeds(References.resolve("magicItem", reference))).toThrow(`${slotted}'s slot`);
  });
});
