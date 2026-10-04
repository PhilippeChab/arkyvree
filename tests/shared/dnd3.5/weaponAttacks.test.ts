import { describe, expect, test } from "bun:test";

import { buildAttackRows } from "@/shared/dnd3.5/weaponAttacks.ts";

describe("a weapon's attack rows", () => {
  test("list a melee weapon's attack, and its thrown attack when it has a range", () => {
    const dagger = { ranged: false, range: 10, tohit: { total: [0] }, thrown: { total: [3] } };
    expect(buildAttackRows(dagger, "Main Hand")).toEqual([
      { key: "Main Hand", label: "Main Hand", attack: [0], range: "Melee" },
      { key: "Main Hand-thrown", label: "Main Hand, thrown", attack: [3], range: "10 ft." },
    ]);
  });

  test("list a ranged weapon's attack once, with its range, and a melee weapon without one once, in melee", () => {
    const crossbow = { ranged: true, range: 80, tohit: { total: [3] }, thrown: null };
    const longsword = { ranged: false, range: 0, tohit: { total: [9, 4] }, thrown: null };
    expect(buildAttackRows(crossbow, "Two Handed")).toEqual([
      { key: "Two Handed", label: "Two Handed", attack: [3], range: "80 ft." },
    ]);
    expect(buildAttackRows(longsword, "Main Hand")).toEqual([
      { key: "Main Hand", label: "Main Hand", attack: [9, 4], range: "Melee" },
    ]);
  });
});
