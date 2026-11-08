import { describe, expect, test } from "bun:test";

import MagicItemBonuses from "@/codegen/pf1/tools/detect/MagicItemBonuses.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";

/** The modifiers of the magic item `name` described as `description`. */
function modifiersOf(name: string, description = "") {
  return new MagicItemBonuses(name, description).modifiers();
}

describe("A magic item's bonuses", () => {
  test("are its variant's name's: a cloak's to every save, a ring's deflection, an amulet's to natural armor", () => {
    expect(modifiersOf("Cloak of Resistance +3")).toEqual([bonus("saves.*.misc", 3)]);
    expect(modifiersOf("Ring of Protection +2")).toEqual([bonus("combat.ac.deflection", 2)]);
    // An enhancement bonus to natural armor, which adds to a natural armor bonus
    expect(modifiersOf("Amulet of Natural Armor +1")).toEqual([bonus("combat.ac.naturalenhancement", 1)]);
    expect(modifiersOf("Bracers of Armor +8")).toEqual([bonus("combat.ac.armor", 8)]);
  });

  test("are a belt's or a headband's to the abilities its name ends on, none for those of the wearer's choice", () => {
    expect(modifiersOf("Belt of Giant Strength +4")).toEqual([bonus("abilities.strength.misc", 4)]);
    expect(modifiersOf("Headband of Mental Superiority +2")).toEqual(
      ["intelligence", "wisdom", "charisma"].map((ability) => bonus(`abilities.${ability}.misc`, 2)),
    );
    expect(modifiersOf("Belt of Physical Might +2")).toEqual([]);
  });

  test("are its description's unconditional skill, save and initiative bonuses", () => {
    expect(modifiersOf("Boots of Elvenkind", "These boots give a +5 competence bonus on Acrobatics checks.")).toEqual([
      bonus("skills.acrobatics.misc", 5),
    ]);
    expect(modifiersOf("Robe of Stars", "The wearer gains a +1 luck bonus on all saving throws.")).toEqual([
      bonus("saves.*.misc", 1),
    ]);
    expect(modifiersOf("Rod", "Its wielder gains a +1 insight bonus on initiative checks.")).toEqual([
      bonus("combat.initiative.misc", 1),
    ]);
  });

  test("are none its description gives sometimes, or on a skill's narrowed checks", () => {
    expect(modifiersOf("Ring", "Once per day, the wearer gains a +10 bonus on Stealth checks.")).toEqual([]);
    expect(modifiersOf("Ring", "The wearer gains a +4 bonus on Stealth checks against undead.")).toEqual([]);
    expect(modifiersOf("Ring", "The wearer gains a +5 competence bonus on Acrobatics checks made to jump.")).toEqual(
      [],
    );
  });

  test("are none of a manual's or a tome's, whose bonus is inherent once read", () => {
    expect(modifiersOf("Tome of Clear Thought +2", "It grants a +2 bonus on all saving throws.")).toEqual([]);
  });
});
