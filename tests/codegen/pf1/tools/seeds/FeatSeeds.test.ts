import { describe, expect, test } from "bun:test";

import { BookSeeds } from "@/codegen/pf1/tools/seeds/BookSeeds.ts";
import { eq, gte } from "@/content/core/builders/customization/requirements.ts";
import { feat } from "@/content/pf1/builders/feats/possession.ts";
import { CORE_BOOK } from "@/vocabulary/pf1/books.ts";
import { FEAT_FAMILY, FEAT_STACKABLE } from "@/vocabulary/pf1/fields/index.ts";

/** The Core Rulebook's feat seeds, as its reference gives them. */
function coreFeatSeeds() {
  const book = new BookSeeds(CORE_BOOK);
  const ref = book.reference("feat");
  if (!ref) throw new Error("The Core Rulebook has no feat reference");
  return book.feats(ref);
}

describe("The Core Rulebook's feat seeds", () => {
  const seeds = coreFeatSeeds();
  const byName = new Map(seeds.seeds().map((seed) => [seed.name, seed]));

  test("leave out the feats the core rules write by hand: the weapon, armor and shield proficiencies", () => {
    for (const name of [
      "Simple Weapon Proficiency",
      "Martial Weapon Proficiency",
      "Exotic Weapon Proficiency",
      "Armor Proficiency, Light",
      "Shield Proficiency",
      "Tower Shield Proficiency",
    ])
      expect(byName.has(name)).toBe(false);
    expect(byName.size).toBe(168);
  });

  test("give a combat feat the fighter's bonus feats, a metamagic feat the wizard's, and their families", () => {
    expect(byName.get("Cleave")).toMatchObject({
      aptitudes: ["General", "Fighter Bonus Feat"],
      requirements: [gte("abilities.strength.total", 13), eq(feat("Power Attack")), gte("combat.bab", 1)],
      fields: { [FEAT_FAMILY]: ["Combat"] },
    });
    expect(byName.get("Empower Spell")).toMatchObject({
      aptitudes: ["General", "Wizard Bonus Feat"],
      fields: { [FEAT_FAMILY]: ["Metamagic"] },
    });
    expect(byName.get("Spell Mastery")?.aptitudes).toEqual(["General", "Wizard Bonus Feat"]);
  });

  test("make a feat taken again stackable, but a family's", () => {
    expect(byName.get("Extra Rage")?.fields).toEqual({ [FEAT_STACKABLE]: true });
    expect(byName.get("Extra Channel")?.fields).toEqual({ [FEAT_STACKABLE]: true });
    expect(byName.get("Toughness")?.fields).toBeUndefined();
    expect(byName.get("Weapon Focus")?.fields).toEqual({ [FEAT_FAMILY]: ["Combat"] });
  });

  test("lead a family per option, its own feats named by the option's family", () => {
    const specialization = seeds.family("Weapon Specialization");
    expect(specialization?.options.list).toBe("ALL_WEAPONS");
    expect(specialization?.proficient).toBe(true);
    expect(specialization?.requirements).toEqual([eq(feat("Weapon Focus")), gte("classes.fighter.level", 4)]);
    expect(seeds.family("Cleave")).toBeUndefined();
  });

  test("note what's left to review, and nothing of a feat written by hand", () => {
    const notes = seeds.notes();
    expect(notes).toContain('Improved Familiar: prerequisite "compatible alignment" not read');
    expect(notes.some((note) => note.startsWith("Armor Proficiency"))).toBe(false);
  });
});
