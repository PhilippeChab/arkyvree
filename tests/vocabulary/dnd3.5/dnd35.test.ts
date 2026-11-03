import { describe, expect, test } from "bun:test";

import { BONDED_KIND_BY_SLUG, BONDED_KIND_SLUGS, BONDED_KINDS } from "@/vocabulary/dnd3.5/bondedKinds.ts";
import { MAGIC_SCHOOLS } from "@/vocabulary/dnd3.5/spells.ts";

describe("D&D 3.5", () => {
  test("gives Spell Focus a school of magic, Universal aside", () => {
    expect(MAGIC_SCHOOLS).toEqual([
      "Abjuration",
      "Conjuration",
      "Divination",
      "Enchantment",
      "Evocation",
      "Illusion",
      "Necromancy",
      "Transmutation",
    ]);
  });

  test("finds each bonded kind by its slug", () => {
    expect(BONDED_KIND_SLUGS).toEqual(["familiar", "animalcompanion", "mount"]);
    for (const kind of BONDED_KINDS) expect(BONDED_KIND_BY_SLUG[kind.slug]).toBe(kind);
    expect(BONDED_KIND_BY_SLUG.mount).toMatchObject({ label: "Special Mount", className: "Special Mount" });
  });
});
