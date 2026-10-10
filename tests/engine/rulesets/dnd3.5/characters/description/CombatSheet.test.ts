import { describe, expect, test } from "bun:test";

import CombatSheet from "@/engine/rulesets/dnd3.5/characters/description/CombatSheet.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { createDruidWithCompanion } from "@/tests/support/dnd3.5/levelFixtures.ts";

/** What the sheet reads of a character's combat. */
type Combat = ReturnType<Parameters<typeof CombatSheet.describe>[0]["getCombat"]>;

/** What the sheet reads of a weapon. */
type Weapon = NonNullable<Combat["weaponsets"][string]["mainhand"]>;

/** The combat the sheet prints for a character whose base attack bonus gives `babAttacks`, with these weapon sets. */
function describeCombat(weaponsets: Combat["weaponsets"], babAttacks = [0], speed = 30) {
  return CombatSheet.describe({
    getBabAttacks: () => babAttacks,
    getCombat: () => ({ speed: { total: speed }, weaponsets }),
  });
}

/** The rows the sheet gives `held`, alone in the first set's `slot`. */
function rowsOf(held: Weapon, slot: "mainhand" | "offhand" | "twohanded" = "mainhand") {
  const set = { mainhand: null, offhand: null, twohanded: null, [slot]: held };
  return describeCombat({ "0": set }).weaponSets[0].weapons[0].rows;
}

/** A weapon as the sheet reads it: a melee one, +0 to hit, 1d4 piercing, ×2 on a 20, with no other attack unless given. */
function weapon(overrides: Partial<Weapon> = {}): Weapon {
  return {
    name: "Dagger",
    natural: null,
    proficient: true,
    ranged: false,
    range: 0,
    tohit: { total: [0] },
    thrown: null,
    twoweapon: null,
    offend: null,
    damage: { total: "1d4", critical: { range: 1, multiplier: 2 }, types: ["Piercing"] },
    ...overrides,
  };
}

// The sheet and its PDF write a weapon's attack and critical one way, as the SRD's weapon tables do
describe("a weapon's attack and critical text", () => {
  test("say a threat on a 20 by its multiplier alone, a wider one by its range too", () => {
    const critical = (range: number, multiplier: number) =>
      rowsOf(weapon({ damage: { total: "1d8", critical: { range, multiplier }, types: [] } }))[0].critical;
    expect([critical(1, 3), critical(2, 2), critical(3, 2)]).toEqual(["×3", "19–20/×2", "18–20/×2"]);
  });

  test("sign each iterative attack, and show none as missing", () => {
    const attack = (total: number[]) => rowsOf(weapon({ tohit: { total } }))[0].attack;
    expect([attack([9, 4]), attack([-1]), attack([0]), attack([])]).toEqual(["+9/+4", "-1", "+0", "—"]);
  });

  test("give a base attack bonus its attacks a round, signed", () => {
    expect([[11, 6, 1], [5], [0], [-1]].map((attacks) => describeCombat({}, attacks).babLabel)).toEqual([
      "+11/+6/+1",
      "+5",
      "+0",
      "-1",
    ]);
  });

  test("give a base attack bonus past +5 a second attack, 5 lower: a druid 12's +9", async () => {
    const { masterId } = await createDruidWithCompanion(12);
    const druid = await buildAs(DetailedCharacter, (await Characters.findOne(db, { id: masterId }))!);
    expect(CombatSheet.describe(druid.components.combat).babLabel).toBe("+9/+4");
  });

  test("write a speed in feet", () => {
    expect([describeCombat({}, [0], 30).speedLabel, describeCombat({}, [0], 0).speedLabel]).toEqual([
      "30 ft.",
      "0 ft.",
    ]);
  });

  test("join a weapon's damage types, and leave none empty", () => {
    const types = (damageTypes: string[]) =>
      rowsOf(weapon({ damage: { total: "1d4", critical: { range: 1, multiplier: 2 }, types: damageTypes } }))[0].types;
    expect([types(["Bludgeoning", "Piercing"]), types([])]).toEqual(["Bludgeoning, Piercing", ""]);
  });
});

describe("a weapon's attack rows", () => {
  test("list a melee weapon's attack, and its thrown attack when it has a range", () => {
    const dagger = weapon({ range: 10, thrown: { dexterity: 3, total: [3] } });
    expect(rowsOf(dagger)).toEqual([
      {
        key: "Main Hand",
        label: "Main Hand",
        attack: "+0",
        damage: "1d4",
        critical: "×2",
        range: "Melee",
        types: "Piercing",
      },
      {
        key: "Main Hand, thrown",
        label: "Main Hand, thrown",
        attack: "+3",
        damage: "1d4",
        critical: "×2",
        range: "10 ft.",
        types: "Piercing",
      },
    ]);
  });

  test("list a ranged weapon's attack once, with its range, and a melee weapon without one once, in melee", () => {
    const crossbow = weapon({ ranged: true, range: 80, tohit: { total: [3] } });
    const longsword = weapon({ tohit: { total: [9, 4] } });
    const brief = (rows: ReturnType<typeof rowsOf>) => rows.map(({ label, attack, range }) => [label, attack, range]);
    expect(brief(rowsOf(crossbow, "twohanded"))).toEqual([["Two Handed", "+3", "80 ft."]]);
    expect(brief(rowsOf(longsword))).toEqual([["Main Hand", "+9/+4", "Melee"]]);
  });

  test("add each attack with two weapons after the weapon's own, thrown too", () => {
    const dagger = weapon({
      range: 10,
      tohit: { total: [6, 1] },
      thrown: { dexterity: 3, total: [8, 3] },
      twoweapon: { total: [4], thrown: [6] },
    });
    expect(rowsOf(dagger, "offhand").map(({ label, attack, range }) => [label, attack, range])).toEqual([
      ["Off Hand", "+6/+1", "Melee"],
      ["Off Hand, thrown", "+8/+3", "10 ft."],
      ["Off Hand, two weapons", "+4", "Melee"],
      ["Off Hand, thrown, two weapons", "+6", "10 ft."],
    ]);

    const darts = weapon({ ranged: true, range: 20, tohit: { total: [5] }, twoweapon: { total: [1], thrown: null } });
    expect(rowsOf(darts).map(({ label, range }) => [label, range])).toEqual([
      ["Main Hand", "20 ft."],
      ["Main Hand, two weapons", "20 ft."],
    ]);
  });

  test("add a double weapon's other end after its attacks with two weapons, with its own damage", () => {
    const staff = weapon({
      tohit: { total: [6, 1] },
      twoweapon: { total: [2, -3], thrown: null, damage: "1d6+3" },
      offend: { total: [-2], damage: "1d6" },
    });
    expect(rowsOf(staff, "twohanded").map(({ label, attack, damage }) => [label, attack, damage])).toEqual([
      ["Two Handed", "+6/+1", "1d4"],
      ["Two Handed, two weapons", "+2/-3", "1d6+3"],
      ["Two Handed, other end", "-2", "1d6"],
    ]);
  });

  test("name a natural attack by its kind, whatever slot holds it", () => {
    expect(rowsOf(weapon({ name: "Bite", natural: "secondary" }), "offhand")[0].label).toBe("Secondary");
  });
});

describe("a sheet's weapon sets", () => {
  test("list the sets that hold a weapon, by their index, each weapon in its slot's order", () => {
    const sword = weapon({ name: "Longsword" });
    const shield = weapon({ name: "Light Shield", proficient: false });
    const { weaponSets } = describeCombat({
      "1": { mainhand: null, offhand: shield, twohanded: null },
      "0": { mainhand: sword, offhand: null, twohanded: null },
      "2": { mainhand: null, offhand: null, twohanded: null },
    });
    expect(
      weaponSets.map(({ set, weapons }) => [set, weapons.map(({ name, proficient }) => [name, proficient])]),
    ).toEqual([
      [0, [["Longsword", true]]],
      [1, [["Light Shield", false]]],
    ]);
  });
});
