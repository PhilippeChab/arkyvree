import { describe, expect, test } from "bun:test";

import { MagicItemText } from "@/codegen/dnd3.5/tools/detect/readers/items/MagicItemText.ts";

/** What a specific armor's or shield's text gives of its stats. */
function armorStats(text: string) {
  return new MagicItemText(text).armorStats();
}

/** What a specific weapon's text gives of its enhancement bonus. */
function weaponEnhancement(text: string) {
  return new MagicItemText(text).weaponEnhancement();
}

describe("A specific armor's text", () => {
  test("gives the stats it changes, its category and weight", () => {
    expect(
      armorStats(
        "The armor has an arcane spell failure chance of 20%, a maximum Dexterity bonus of +4, and an armor check penalty of -2. It is considered light armor and weighs 20 pounds.",
      ),
    ).toEqual({
      properties: [
        { type: "ITEM_SPELL_FAILURE", value: "20" },
        { type: "ARMOR_MAX_DEX", value: "4" },
        { type: "ARMOR_CHECK_PENALTY", value: "-2" },
        { type: "ARMOR_PROFICIENCY", value: "Light" },
      ],
      weight: "20",
    });
    expect(
      armorStats("It has a 5% arcane spell failure chance and no armor check penalty. It weighs 2½ pounds."),
    ).toEqual({
      properties: [
        { type: "ITEM_SPELL_FAILURE", value: "5" },
        { type: "ARMOR_CHECK_PENALTY", value: "0" },
      ],
      weight: "2.5",
    });
  });

  test("gives its enhancement bonus, magic armor being masterwork unless its check penalty is given", () => {
    expect(armorStats("Ten 100-gp gems adorn this +3 banded mail.")).toEqual({
      properties: [{ type: "ITEM_MASTERWORK", value: "true" }],
      enhancement: 3,
    });
    // A bonus to something else first, and a spine's enhancement after the shield's
    expect(
      armorStats("This finely crafted +2 breastplate grants a +2 competence bonus on Charisma checks."),
    ).toMatchObject({ enhancement: 2 });
    expect(
      armorStats("This +1 heavy steel shield is covered in spines. A fired spine has a +2 enhancement bonus."),
    ).toMatchObject({ enhancement: 1 });
    expect(armorStats("This round heavy wooden shield has a +3 enhancement bonus.")).toMatchObject({
      enhancement: 3,
    });
    expect(armorStats("This +2 hide armor is made from rhinoceros hide. It has a -1 armor check penalty.")).toEqual({
      properties: [{ type: "ARMOR_CHECK_PENALTY", value: "-1" }],
      enhancement: 2,
    });
    // Adamantine armor is masterwork, magic or not; darkwood says it has no enhancement bonus
    expect(armorStats("This nonmagical breastplate is made of adamantine.")).toEqual({
      properties: [{ type: "ITEM_MASTERWORK", value: "true" }],
    });
    expect(armorStats("It has no enhancement bonus, but its construction material makes it lighter.")).toEqual({
      properties: [],
    });
  });
});

describe("A specific weapon's text", () => {
  test("gives its enhancement bonus as it first states it, a later conditional one left to its text", () => {
    const plusTwo = { attack: 2, damage: 2 };
    expect(weaponEnhancement("This +2 short sword gives its possessor a +1 luck bonus on all saving throws.")).toEqual(
      plusTwo,
    );
    expect(
      weaponEnhancement("This +2 cold iron longsword becomes a +5 holy cold iron longsword in the hands of a paladin."),
    ).toEqual(plusTwo);
    expect(weaponEnhancement("This +1/+1 two-bladed sword has blades of alchemical silver.")).toEqual({
      attack: 1,
      damage: 1,
    });
    expect(
      weaponEnhancement(
        "This longsword has an enhancement bonus of +1 on the Material Plane. It operates as a +3 longsword on the Astral Plane.",
      ),
    ).toEqual({ attack: 1, damage: 1 });
  });

  test("gives a masterwork weapon's +1 on attack rolls only, and nothing for a weapon without a bonus", () => {
    expect(weaponEnhancement("As a masterwork weapon, it has a +1 enhancement bonus on attack rolls.")).toEqual({
      attack: 1,
      damage: 0,
    });
    expect(weaponEnhancement("This javelin becomes a 5d6 lightning bolt when thrown.")).toBeUndefined();
  });
});
