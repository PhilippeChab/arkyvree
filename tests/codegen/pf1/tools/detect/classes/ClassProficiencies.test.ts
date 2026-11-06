import { describe, expect, test } from "bun:test";

import { ClassProficiencies } from "@/codegen/pf1/tools/detect/classes/ClassProficiencies.ts";

/** The slugs of the feats a proficiency text grants, and the pools it picks in. */
function grantedBy(text: string): string[] {
  return new ClassProficiencies(text).modifiers().map(({ target }) => target.split(".")[1]);
}

describe("A class's Weapon and Armor Proficiency feature", () => {
  test("grants all simple and martial weapons, armor and shields, and tower shields when it includes them", () => {
    expect(
      grantedBy(
        "A fighter is proficient with all simple and martial weapons and with all armor (heavy, light, and medium) and shields (including tower shields).",
      ),
    ).toEqual([
      "simpleweaponproficiency",
      "martialweaponproficiency",
      "armorproficiencylight",
      "armorproficiencymedium",
      "armorproficiencyheavy",
      "shieldproficiency",
      "towershieldproficiency",
    ]);
  });

  test("grants each weapon it lists its own proficiency, a group of them each of its weapons'", () => {
    expect(
      grantedBy(
        "Rogues are proficient with all simple weapons, plus the hand crossbow, rapier, sap, shortbow, and short sword. They are proficient with light armor, but not with shields.",
      ),
    ).toEqual([
      "simpleweaponproficiency",
      "exoticweaponproficiencyhandcrossbow",
      "martialweaponproficiencyrapier",
      "martialweaponproficiencysap",
      "martialweaponproficiencyshortbow",
      "martialweaponproficiencyshortsword",
      "armorproficiencylight",
    ]);
    expect(grantedBy("Monks are proficient with the club, crossbow (light or heavy), and kama.")).toEqual([
      "simpleweaponproficiencyclub",
      "simpleweaponproficiencylightcrossbow",
      "simpleweaponproficiencyheavycrossbow",
      "exoticweaponproficiencykama",
    ]);
  });

  test("grants nothing it denies, and a pick of a cleric's deity's favored weapon", () => {
    expect(grantedBy("Eldritch knights gain no proficiency with any weapon or armor.")).toEqual([]);
    expect(
      grantedBy(
        "Sorcerers are proficient with all simple weapons. They are not proficient with any type of armor or shield.",
      ),
    ).toEqual(["simpleweaponproficiency"]);
    expect(grantedBy("Clerics are also proficient with the favored weapon of their deity.")).toEqual([
      "deitysfavoredweapon",
    ]);
  });

  test("leaves unread a proficiency it gives to pick that no pool offers", () => {
    expect(new ClassProficiencies("The commoner is proficient with one simple weapon.").unread()).toEqual([
      "proficiency with one simple weapon",
    ]);
  });
});
