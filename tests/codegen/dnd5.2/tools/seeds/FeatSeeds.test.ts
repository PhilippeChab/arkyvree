import { describe, expect, test } from "bun:test";

import References from "@/codegen/dnd5.2/tools/references/References.ts";
import { FeatSeeds } from "@/codegen/dnd5.2/tools/seeds/FeatSeeds.ts";
import { CORE_BOOK } from "@/vocabulary/dnd5.2/books.ts";

/** The book's feats, each by name: a class feature's feats read as a fighter's (`Fighting Style (Fighter)`). */
function readFeats() {
  const ref = References.load(References.path(CORE_BOOK, "feat"), "feat");
  const seeds = new FeatSeeds(ref, (feature) => [`${feature} (Fighter)`]).seeds();
  const all = [...seeds.values()].flat();
  return { all, seeds, named: (name: string) => all.find((feat) => feat.name === name) };
}

describe("The SRD 5.2.1's feats, as the generator reads them", () => {
  test("group by their categories, a feat taken with a choice a feat per option", () => {
    const { seeds } = readFeats();
    expect(Object.fromEntries([...seeds].map(([category, feats]) => [category, feats.length]))).toEqual({
      Origin: 6,
      General: 23,
      "Fighting Style": 4,
      "Epic Boon": 35,
    });
    expect(seeds.get("Origin")!.map(({ name }) => name)).toEqual([
      "Alert",
      "Magic Initiate (Cleric)",
      "Magic Initiate (Druid)",
      "Magic Initiate (Wizard)",
      "Savage Attacker",
      "Skilled",
    ]);
  });

  test("make the Ability Score Improvement its 21 spreads, each from the 4th level", () => {
    const { all, named } = readFeats();
    const spreads = all.filter(({ name }) => name.startsWith("Ability Score Improvement ("));
    expect(spreads).toHaveLength(21);
    expect(named("Ability Score Improvement (Strength +2)")).toMatchObject({
      aptitudes: ["Ability Score Improvement", "Epic Boon"],
      requirements: [{ target: "identity.meta.level", value: "4" }],
      modifiers: [{ target: "abilities.strength.misc", operator: "add", value: "2" }],
    });
    expect(named("Ability Score Improvement (Strength +1, Wisdom +1)")?.modifiers).toHaveLength(2);
  });

  test("read an ability score's increase as a variant per ability, with the feat's prerequisites", () => {
    const { named } = readFeats();
    expect(named("Grappler (Dexterity)")).toMatchObject({
      requirements: [
        { target: "identity.meta.level", value: "4" },
        {
          chainingOperator: "or",
          children: [{ target: "abilities.strength.total" }, { target: "abilities.dexterity.total" }],
        },
      ],
      modifiers: [{ target: "abilities.dexterity.misc", value: "1" }],
    });
    // Its versions name no other: the engine's feat rules take one of a feat taken once (FEATS_TAKEN_ONCE)
    expect(named("Grappler (Dexterity)")?.requirements).toHaveLength(2);
  });

  test("give Magic Initiate a spell list's rooms, and a Fighting Style any class's Fighting Style and its bonus", () => {
    const { named } = readFeats();
    expect(named("Magic Initiate (Druid)")?.modifiers).toEqual([
      { target: "aptitudes.druidspells.0.allowed", operator: "add", value: "2", valueType: "number" },
      { target: "aptitudes.druidspells.1.allowed", operator: "add", value: "1", valueType: "number" },
    ]);
    // Any feat of the Fighting Style family: every class's Fighting Style, a fork's class's own too
    expect(named("Defense")).toMatchObject({
      requirements: [{ target: "feats.fightingstyle.*.possessed" }],
      modifiers: [{ target: "combat.ac.misc", value: "1", requirements: [{ target: "combat.armor.category" }] }],
    });
    // Its override's name, the SRD's
    expect(named("Two-Weapon Fighting")?.modifiers).toEqual([
      { target: "combat.twoweapon.ability", operator: "set", value: "true", valueType: "boolean" },
    ]);
  });
});
