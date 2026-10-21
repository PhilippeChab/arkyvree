import { describe, expect, test } from "bun:test";

import CombatSheet from "@/engine/rulesets/dnd3.5/characters/description/CombatSheet.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { createDruidWithCompanion } from "@/tests/support/dnd3.5/levelFixtures.ts";
import { findSeededCharacter } from "@/tests/support/seed.ts";

/** What the sheet reads of a character's combat. */
type Combat = ReturnType<Parameters<typeof CombatSheet.describe>[0]["getCombat"]>;

/** What the sheet reads of a weapon. */
type Weapon = NonNullable<Combat["weaponsets"][string]["mainhand"]>;

/** A weapon set's armor class as the sheet reads it: 10 and a +2 Dexterity bonus, which flat-footed loses. */
const ARMOR_CLASS: Combat["weaponsets"][string]["ac"] = { total: 12, touch: 12, flatfooted: 10 };

/** A light load: nothing carried, a 100 lb. heavy load. */
const LIGHT_LOAD: Combat["encumbrance"] = {
  carriedweight: 0,
  checkpenalty: 0,
  heavyload: 100,
  lightload: 33,
  load: "light",
  maxdex: 99,
  mediumload: 66,
};

/** A set's off hand holding no shield. */
const NO_SHIELD = { names: [] };

/** The combat the sheet prints for a character of this base attack bonus, with these weapon sets. */
function describeCombat(weaponsets: Combat["weaponsets"], bab = 0, speed = 30, encumbrance = LIGHT_LOAD) {
  return CombatSheet.describe({
    getCombat: () => ({
      ac: {},
      bab,
      encumbrance,
      grapple: { total: 0 },
      hp: { total: 0 },
      initiative: { total: 0 },
      speed: { total: speed },
      weaponsets,
    }),
  });
}

/** Each row's label, range and increment, as the sheet prints them. */
function rangesOf(rows: ReturnType<typeof rowsOf>) {
  return rows.map(({ label, range, increment }) => [label, range, increment]);
}

/** The rows the sheet gives `held`, alone in the first set's `slot`. */
function rowsOf(held: Weapon, slot: "mainhand" | "offhand" | "twohanded" = "mainhand") {
  const set = { ac: ARMOR_CLASS, shield: NO_SHIELD, mainhand: null, offhand: null, twohanded: null, [slot]: held };
  return describeCombat({ "0": set }).weaponSets[0].weapons[0].rows;
}

/** A weapon as the sheet reads it: a melee one, +0 to hit, 1d4 piercing, ×2 on a 20, with no other attack unless given. */
function weapon(overrides: Partial<Weapon> = {}): Weapon {
  return {
    name: "Dagger",
    itemId: "dagger",
    natural: null,
    proficient: true,
    ranged: false,
    range: 0,
    maxRange: 0,
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
    expect([11, 6, 5, 0, -1].map((bab) => describeCombat({}, bab).babLabel)).toEqual([
      "+11/+6/+1",
      "+6/+1",
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
    expect([describeCombat({}, 0, 30).speedLabel, describeCombat({}, 0, 0).speedLabel]).toEqual(["30 ft.", "0 ft."]);
  });

  test("join a weapon's damage types, and leave none empty", () => {
    const types = (damageTypes: string[]) =>
      rowsOf(weapon({ damage: { total: "1d4", critical: { range: 1, multiplier: 2 }, types: damageTypes } }))[0].types;
    expect([types(["Bludgeoning", "Piercing"]), types([])]).toEqual(["Bludgeoning, Piercing", ""]);
  });
});

describe("a weapon's attack rows", () => {
  test("list a melee weapon's attack, and its thrown attack when it has a range, with its range and increment", () => {
    const dagger = weapon({ range: 10, maxRange: 50, thrown: { dexterity: 3, total: [3] } });
    expect(rowsOf(dagger)).toEqual([
      {
        key: "Main Hand",
        label: "Main Hand",
        attack: "+0",
        damage: "1d4",
        critical: "×2",
        range: "",
        increment: "",
        types: "Piercing",
      },
      {
        key: "Main Hand, thrown",
        label: "Main Hand, thrown",
        attack: "+3",
        damage: "1d4",
        critical: "×2",
        range: "50 ft.",
        increment: "-2 / 10 ft.",
        types: "Piercing",
      },
    ]);
  });

  test("list a ranged weapon's attack once, with its range, and a melee weapon without one once, with none", () => {
    const crossbow = weapon({ ranged: true, range: 80, maxRange: 800, tohit: { total: [3] } });
    const longsword = weapon({ tohit: { total: [9, 4] } });
    const brief = (rows: ReturnType<typeof rowsOf>) =>
      rows.map(({ label, attack, range, increment }) => [label, attack, range, increment]);
    expect(brief(rowsOf(crossbow, "twohanded"))).toEqual([["Two Handed", "+3", "800 ft.", "-2 / 80 ft."]]);
    expect(brief(rowsOf(longsword))).toEqual([["Main Hand", "+9/+4", "", ""]]);
  });

  test("add each attack with two weapons after the weapon's own, thrown too", () => {
    const dagger = weapon({
      range: 10,
      maxRange: 50,
      tohit: { total: [6, 1] },
      thrown: { dexterity: 3, total: [8, 3] },
      twoweapon: { total: [4], thrown: [6] },
    });
    expect(rowsOf(dagger, "offhand").map(({ label, attack, range }) => [label, attack, range])).toEqual([
      ["Off Hand", "+6/+1", ""],
      ["Off Hand, thrown", "+8/+3", "50 ft."],
      ["Off Hand, two weapons", "+4", ""],
      ["Off Hand, thrown, two weapons", "+6", "50 ft."],
    ]);

    const darts = weapon({
      ranged: true,
      range: 20,
      maxRange: 100,
      tohit: { total: [5] },
      twoweapon: { total: [1], thrown: null },
    });
    expect(rowsOf(darts).map(({ label, range }) => [label, range])).toEqual([
      ["Main Hand", "100 ft."],
      ["Main Hand, two weapons", "100 ft."],
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

// The SRD: -2 for each full range increment between attacker and target, out to five increments thrown, ten shot
describe("a ranged attack's range and increment", () => {
  test("give the farthest a weapon reaches, and its penalty for each range increment past the first", () => {
    const darts = weapon({ ranged: true, range: 20, maxRange: 100 });
    const longbow = weapon({ ranged: true, range: 110, maxRange: 1100 });
    expect([...rangesOf(rowsOf(darts)), ...rangesOf(rowsOf(longbow, "twohanded"))]).toEqual([
      ["Main Hand", "100 ft.", "-2 / 20 ft."],
      ["Two Handed", "1,100 ft.", "-2 / 110 ft."],
    ]);
  });

  test("give a net, which reaches only its first increment, its range and no increment", () => {
    expect(rangesOf(rowsOf(weapon({ name: "Net", ranged: true, range: 10, maxRange: 10 })))).toEqual([
      ["Main Hand", "10 ft.", ""],
    ]);
  });

  test("give a melee row neither, nor a ranged weapon without a range increment", () => {
    const dagger = weapon({ range: 10, maxRange: 50, thrown: { dexterity: 3, total: [3] } });
    expect(rangesOf(rowsOf(dagger))[0]).toEqual(["Main Hand", "", ""]);
    expect(rangesOf(rowsOf(weapon({ ranged: true })))).toEqual([["Main Hand", "", ""]]);
  });

  test("reach a seeded bow's and crossbow's ten range increments, and a thrown dagger's five", async () => {
    // Fenn: a longbow; Vex: a dagger, melee and thrown, then a light crossbow
    const describeSeeded = async (name: string) =>
      CombatSheet.describe((await buildAs(DetailedCharacter, await findSeededCharacter(name))).components.combat);
    const ranges = (combat: Awaited<ReturnType<typeof describeSeeded>>) =>
      combat.weaponSets.flatMap(({ weapons }) => weapons.flatMap(({ rows }) => rangesOf(rows)));
    expect(ranges(await describeSeeded("Fenn Ashwalker"))).toEqual([["Two Handed", "1,000 ft.", "-2 / 100 ft."]]);
    expect(ranges(await describeSeeded("Vex Flamecaller"))).toEqual([
      ["Main Hand", "", ""],
      ["Main Hand, thrown", "50 ft.", "-2 / 10 ft."],
      ["Two Handed", "800 ft.", "-2 / 80 ft."],
    ]);
  });
});

describe("a sheet's weapon sets", () => {
  test("list every set by its index, its armor class beside each weapon in its slot's order, a set holding none too", () => {
    const sword = weapon({ name: "Longsword" });
    const spikes = weapon({ name: "Shield Spikes", proficient: false });
    const shielded = { total: 14, touch: 12, flatfooted: 12 };
    const heavy = { names: ["Heavy Steel Shield"] };
    const { weaponSets } = describeCombat({
      "1": { ac: shielded, shield: NO_SHIELD, mainhand: null, offhand: spikes, twohanded: null },
      "0": { ac: ARMOR_CLASS, shield: NO_SHIELD, mainhand: sword, offhand: null, twohanded: null },
      "2": { ac: shielded, shield: heavy, mainhand: null, offhand: null, twohanded: null },
    });
    expect(
      weaponSets.map(({ set, ac, weapons }) => [
        set,
        ac.total,
        weapons.map(({ name, proficient }) => [name, proficient]),
      ]),
    ).toEqual([
      [0, 12, [["Longsword", true]]],
      [1, 14, [["Shield Spikes", false]]],
      [2, 14, []],
    ]);
  });

  test("give a set's AC, touch and flat-footed as their values stand, and none of its parts", () => {
    // The engine's armor class, which holds its parts too
    const ac = { ...ARMOR_CLASS, base: 10, dexterity: 2, misc: 0 };
    const { weaponSets } = describeCombat({
      "0": { ac, shield: NO_SHIELD, mainhand: null, offhand: null, twohanded: null },
    });
    expect(weaponSets[0].ac).toEqual(ARMOR_CLASS);
  });

  test("name what each set's hands hold, its weapons then its shield, and no item for a strike without one", () => {
    const fist = weapon({ name: "Unarmed Strike", itemId: null });
    const bite = weapon({ name: "Bite", itemId: null, natural: "primary" });
    const heavy = { names: ["Heavy Steel Shield"] };
    const { weaponSets, hasWeaponSets } = describeCombat({
      "0": { ac: ARMOR_CLASS, shield: heavy, mainhand: weapon({ name: "Longsword" }), offhand: null, twohanded: null },
      "1": { ac: ARMOR_CLASS, shield: NO_SHIELD, mainhand: fist, offhand: null, twohanded: null },
    });
    expect([weaponSets.map(({ held }) => held), hasWeaponSets]).toEqual([
      [["Longsword", "Heavy Steel Shield"], []],
      true,
    ]);
    // A character striking unarmed, or a creature's natural attacks, has no weapon set: its one loadout's held nothing
    const unarmed = (slot: Weapon) =>
      describeCombat({ "0": { ac: ARMOR_CLASS, shield: NO_SHIELD, mainhand: slot, offhand: null, twohanded: null } })
        .hasWeaponSets;
    expect([unarmed(fist), unarmed(bite)]).toEqual([false, false]);
  });
});

describe("a sheet's combat line", () => {
  test("labels its stats in the PDF's order, a bonded creature's summary its HP, BAB and speed", () => {
    const combat = describeCombat({}, 6, 20);
    expect(combat.stats.map(({ label, value }) => `${label} ${value}`)).toEqual([
      "HP 0",
      "Initiative +0",
      "Speed 20 ft.",
      "BAB +6/+1",
      "Grapple +0",
    ]);
    expect(combat.summary.map(({ label }) => label)).toEqual(["HP", "BAB", "Speed"]);
  });

  test("labels a set's armor class boxes, and a load's figures with a status past light", () => {
    const set = { ac: ARMOR_CLASS, shield: NO_SHIELD, mainhand: null, offhand: null, twohanded: null };
    expect(describeCombat({ "0": set }).weaponSets[0].armorClass).toEqual([
      { label: "AC", value: "12" },
      { label: "Touch", value: "12" },
      { label: "Flat-footed", value: "10" },
    ]);
    const light = describeCombat({}).load;
    expect(light.figures.map(({ shortLabel, weight }) => [shortLabel, weight])).toEqual([
      ["Carried", 0],
      ["Light", 33],
      ["Medium", 66],
      ["Heavy", 100],
    ]);
    expect(light.status).toBeNull();
    const heavy = describeCombat({}, 0, 30, { ...LIGHT_LOAD, carriedweight: 80, load: "heavy" }).load;
    expect(heavy.status).toEqual({ label: "Heavy", tone: "warning" });
  });
});
