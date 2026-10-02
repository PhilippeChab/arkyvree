import { describe, expect, test } from "bun:test";

import { abilityModifier } from "@/shared/dnd3.5/abilities.ts";
import { BONDED_KIND_BY_SLUG, BONDED_KIND_SLUGS, BONDED_KINDS } from "@/shared/dnd3.5/bondedKinds.ts";
import { MAGIC_SCHOOLS, spellPossessionSlug } from "@/shared/dnd3.5/spells.ts";

describe("D&D 3.5", () => {
  test("gives an ability score's modifier: +1 for every two points above 10, rounded down", () => {
    expect([1, 8, 9, 10, 11, 12, 18, 19].map(abilityModifier)).toEqual([-5, -1, -1, 0, 0, 1, 4, 4]);
  });

  test("names a spell list's possession paths after its aptitude, without the Spells suffix", () => {
    expect(spellPossessionSlug("Wizard Spells")).toBe("wizard");
    expect(spellPossessionSlug("Knowledge Domain Spells")).toBe("knowledgedomain");
    expect(spellPossessionSlug("Spells of the Deep")).toBe("spellsofthedeep");
  });

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
