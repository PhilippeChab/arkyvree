import { describe, expect, test } from "bun:test";

import { buildAttackRows, formatAttackBonus, formatCritical } from "@/shared/dnd3.5/weaponAttacks.ts";

// The sheet and its PDF write a weapon's attack and critical one way, as the SRD's weapon tables do
describe("a weapon's attack and critical text", () => {
  test("say a threat on a 20 by its multiplier alone, a wider one by its range too", () => {
    expect([
      formatCritical({ range: 1, multiplier: 3 }),
      formatCritical({ range: 2, multiplier: 2 }),
      formatCritical({ range: 3, multiplier: 2 }),
    ]).toEqual(["×3", "19–20/×2", "18–20/×2"]);
  });

  test("sign each iterative attack, and show none as missing", () => {
    expect([formatAttackBonus([9, 4]), formatAttackBonus([-1]), formatAttackBonus([0]), formatAttackBonus([])]).toEqual(
      ["+9/+4", "-1", "+0", "—"],
    );
  });
});

describe("a weapon's attack rows", () => {
  test("list a melee weapon's attack, and its thrown attack when it has a range", () => {
    const dagger = {
      ranged: false,
      range: 10,
      tohit: { total: [0] },
      thrown: { total: [3] },
      twoweapon: null,
      offend: null,
    };
    expect(buildAttackRows(dagger, "Main Hand")).toEqual([
      { key: "Main Hand", label: "Main Hand", attack: [0], range: "Melee" },
      { key: "Main Hand, thrown", label: "Main Hand, thrown", attack: [3], range: "10 ft." },
    ]);
  });

  test("list a ranged weapon's attack once, with its range, and a melee weapon without one once, in melee", () => {
    const crossbow = { ranged: true, range: 80, tohit: { total: [3] }, thrown: null, twoweapon: null, offend: null };
    const longsword = {
      ranged: false,
      range: 0,
      tohit: { total: [9, 4] },
      thrown: null,
      twoweapon: null,
      offend: null,
    };
    expect(buildAttackRows(crossbow, "Two Handed")).toEqual([
      { key: "Two Handed", label: "Two Handed", attack: [3], range: "80 ft." },
    ]);
    expect(buildAttackRows(longsword, "Main Hand")).toEqual([
      { key: "Main Hand", label: "Main Hand", attack: [9, 4], range: "Melee" },
    ]);
  });

  test("add each attack with two weapons after the weapon's own, thrown too", () => {
    const dagger = {
      ranged: false,
      range: 10,
      tohit: { total: [6, 1] },
      thrown: { total: [8, 3] },
      twoweapon: { total: [4], thrown: [6] },
      offend: null,
    };
    expect(buildAttackRows(dagger, "Off Hand").map(({ label, attack, range }) => [label, attack, range])).toEqual([
      ["Off Hand", [6, 1], "Melee"],
      ["Off Hand, thrown", [8, 3], "10 ft."],
      ["Off Hand, two weapons", [4], "Melee"],
      ["Off Hand, thrown, two weapons", [6], "10 ft."],
    ]);

    const darts = {
      ranged: true,
      range: 20,
      tohit: { total: [5] },
      thrown: null,
      twoweapon: { total: [1], thrown: null },
      offend: null,
    };
    expect(buildAttackRows(darts, "Main Hand").map(({ label, range }) => [label, range])).toEqual([
      ["Main Hand", "20 ft."],
      ["Main Hand, two weapons", "20 ft."],
    ]);
  });

  test("add a double weapon's other end after its attacks with two weapons, with its own damage", () => {
    const staff = {
      ranged: false,
      range: 0,
      tohit: { total: [6, 1] },
      thrown: null,
      twoweapon: { total: [2, -3], thrown: null },
      offend: { total: [-2], damage: "1d6" },
    };
    expect(buildAttackRows(staff, "Two Handed").map(({ label, attack, damage }) => [label, attack, damage])).toEqual([
      ["Two Handed", [6, 1], undefined],
      ["Two Handed, two weapons", [2, -3], undefined],
      ["Two Handed, other end", [-2], "1d6"],
    ]);
  });
});
