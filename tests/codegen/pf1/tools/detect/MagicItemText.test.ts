import { describe, expect, test } from "bun:test";

import { MagicItemText } from "@/codegen/pf1/tools/detect/MagicItemText.ts";
import {
  ARMOR_CHECK_PENALTY,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  ITEM_MASTERWORK,
  ITEM_SPELL_FAILURE,
} from "@/vocabulary/pf1/fields/index.ts";

describe("A specific magic item's text", () => {
  test("names its base item: the first its text names, an alias's, else its name's", () => {
    expect(
      new MagicItemText("This sword is the size of a bastard sword, wielded as a short sword.").baseItem(
        "Sun Blade",
        "weapon",
      ),
    ).toBe("Bastard Sword");
    expect(
      new MagicItemText("Of elven make, this white +2 composite longbow whispers.").baseItem("Oathbow", "weapon"),
    ).toBe("Composite Longbow");
    expect(
      new MagicItemText("This plate armor is fashioned to look like a demon.").baseItem("Demon Armor", "armor"),
    ).toBe("Full Plate");
    expect(new MagicItemText("This heavy shield is made of mithral.").baseItem("Mithral Heavy Shield", "shield")).toBe(
      "Heavy Steel Shield",
    );
    expect(new MagicItemText("Point it to find predators.").baseItem("Trident of Warning", "weapon")).toBe("Trident");
    expect(
      new MagicItemText("This +1 arrow is keyed to a creature.").baseItem("Slaying Arrow", "weapon"),
    ).toBeUndefined();
  });

  test("gives a specific armor's stats over its base's, and its enhancement", () => {
    const text =
      "This +3 chainmail has a maximum Dexterity bonus of +8, an armor check penalty of –2, and an arcane spell failure chance of 15%. It is considered light armor.";
    expect(new MagicItemText(text).armorStats()).toEqual({
      enhancement: 3,
      fields: {
        [ITEM_SPELL_FAILURE]: 15,
        [ARMOR_MAX_DEX]: 8,
        [ARMOR_CHECK_PENALTY]: -2,
        [ARMOR_PROFICIENCY]: "Light",
      },
    });
    expect(new MagicItemText("This +2 breastplate bears a bear.").armorStats()).toEqual({
      enhancement: 2,
      fields: { [ITEM_MASTERWORK]: true },
    });
  });

  test("gives a specific weapon's enhancement: the first its text gives, a masterwork weapon's on attacks alone", () => {
    expect(
      new MagicItemText("This +2 cold iron longsword becomes a +5 holy cold iron longsword.").weaponEnhancement(),
    ).toEqual({
      attack: 2,
      damage: 2,
    });
    expect(
      new MagicItemText(
        "As a masterwork weapon, this silver dagger has a +1 enhancement bonus on attack rolls.",
      ).weaponEnhancement(),
    ).toEqual({ attack: 1, damage: 0 });
    expect(
      new MagicItemText("This longsword has an enhancement bonus of +1 on the Material Plane.").weaponEnhancement(),
    ).toEqual({
      attack: 1,
      damage: 1,
    });
  });

  test("gives what it's made of, by its name, else its text", () => {
    expect(new MagicItemText("").material("Adamantine Dagger")).toBe("Adamantine");
    expect(new MagicItemText("This full plate is made of adamantine.").material("Dwarven Plate")).toBe("Adamantine");
    expect(new MagicItemText("Its blades are of alchemical silver.").material("Shifter's Sorrow")).toBe("Silver");
    expect(new MagicItemText("A sword.").material("Sun Blade")).toBeUndefined();
  });
});
