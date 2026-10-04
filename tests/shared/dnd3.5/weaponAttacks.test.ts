import { describe, expect, test } from "bun:test";

import { buildAttackRows } from "@/shared/dnd3.5/weaponAttacks.ts";

describe("a weapon's attack rows", () => {
  test("list a melee weapon's attack, and its thrown attack when it has a range", () => {
    const dagger = { ranged: false, range: 10, tohit: { total: [0] }, thrown: { total: [3] }, twoweapon: null };
    expect(buildAttackRows(dagger, "Main Hand")).toEqual([
      { key: "Main Hand", label: "Main Hand", attack: [0], range: "Melee" },
      { key: "Main Hand, thrown", label: "Main Hand, thrown", attack: [3], range: "10 ft." },
    ]);
  });

  test("list a ranged weapon's attack once, with its range, and a melee weapon without one once, in melee", () => {
    const crossbow = { ranged: true, range: 80, tohit: { total: [3] }, thrown: null, twoweapon: null };
    const longsword = { ranged: false, range: 0, tohit: { total: [9, 4] }, thrown: null, twoweapon: null };
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
    };
    expect(buildAttackRows(darts, "Main Hand").map(({ label, range }) => [label, range])).toEqual([
      ["Main Hand", "20 ft."],
      ["Main Hand, two weapons", "20 ft."],
    ]);
  });
});
