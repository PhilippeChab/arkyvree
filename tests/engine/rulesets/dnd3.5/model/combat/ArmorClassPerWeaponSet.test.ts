import { describe, expect, test } from "bun:test";

import CombatSheet from "@/engine/rulesets/dnd3.5/characters/description/CombatSheet.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { db } from "@/server/database/index.ts";
import { Modifiers, Requirements } from "@/server/repositories/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import type { Requirement } from "@/shared/relations.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { type Carried, carry, createTestItem } from "@/tests/support/items.ts";
import { invalidateSeededRuleset } from "@/tests/support/rulesets.ts";
import { findSeededCharacter, getSeedCtx } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

/** The loadouts of the issue (#236): a longsword and a heavy steel shield in the first set, a greatsword in the second. */
const SWORD_AND_BOARD: Carried[] = [
  { item: "Longsword", location: "Main Hand", weaponSet: 0 },
  { item: "Heavy Steel Shield", location: "Off Hand", weaponSet: 0 },
  { item: "Greatsword", location: "Two Handed", weaponSet: 1 },
];

/** Each weapon set's armor class totals, by the set's key (stored from 0). */
function armorClasses(detailed: DetailedCharacter) {
  const { weaponsets } = detailed.components.combat.getCombat();
  return Object.fromEntries(
    Object.entries(weaponsets).map(([set, { ac }]) => [
      set,
      { total: ac.total, touch: ac.touch, flatfooted: ac.flatfooted },
    ]),
  );
}

/** One group of one requirement: that `target` is at least `value`. */
function atLeast(target: string, value: number): Requirement[][] {
  const now = new Date().toISOString();
  const requirement: Requirement = {
    id: target,
    entityId: "test",
    entityType: "test",
    level: "1",
    target,
    operator: "greater_than_or_equal",
    value: String(value),
    valueType: "number",
    chainingOperator: null,
    createdAt: now,
    deletedAt: null,
    updatedAt: now,
  };
  return [[requirement]];
}

/** The seeded character, carrying only these items, built. */
async function buildCarrying(name: string, carried: Carried[] = []) {
  const character = await findSeededCharacter(name);
  await carry(character, carried);
  return buildAs(DetailedCharacter, character);
}

/** A modifier of `name`'s race, gated on holding no shield: it applies to the seeded character. */
async function unshieldedRaceBonus(name: string, target: string, value: string) {
  const character = await findSeededCharacter(name);
  const [modifier] = await Modifiers.create(db, {
    sourceId: character.raceId,
    sourceType: "races",
    target,
    operator: "add",
    value,
    valueType: "number",
  });
  await Requirements.create(db, {
    entityId: modifier.id,
    entityType: "modifiers",
    level: "1",
    target: "combat.shield.held",
    operator: "equal",
    value: "false",
    valueType: "boolean",
  });
  invalidateSeededRuleset((await getSeedCtx()).rulesetId);
}

describe("a weapon set's armor class", () => {
  test("is its own, a shield's bonus counted only in the set that holds it: AC, touch and flat-footed", async () => {
    // A fighter, DEX 14 (+2), no armor: the heavy steel shield's +2 in the first set only
    const bjorn = await buildCarrying("Bjorn Ironhand", SWORD_AND_BOARD);
    expect(armorClasses(bjorn)).toEqual({
      "0": { total: 14, touch: 12, flatfooted: 12 },
      "1": { total: 12, touch: 12, flatfooted: 10 },
    });
    const { shield, weaponsets } = bjorn.components.combat.getCombat();
    expect([shield.held, weaponsets["0"].shield.held, weaponsets["1"].shield.held]).toEqual([true, true, false]);
  });

  test("is a set's of a shield held alone, and one loadout's, with no shield, for a character with no weapon set", async () => {
    const shieldAlone = await buildCarrying("Bjorn Ironhand", [
      { item: "Heavy Steel Shield", location: "Off Hand", weaponSet: 1 },
    ]);
    // The first set strikes unarmed; the second holds the shield and no weapon
    expect(armorClasses(shieldAlone)).toEqual({
      "0": { total: 12, touch: 12, flatfooted: 10 },
      "1": { total: 14, touch: 12, flatfooted: 12 },
    });
    const empty = await buildCarrying("Bjorn Ironhand");
    expect(armorClasses(empty)).toEqual({ "0": { total: 12, touch: 12, flatfooted: 10 } });
    expect(empty.components.combat.getCombat().shield.held).toBe(false);
  });

  test("takes a magic shield's enhancement in the set that holds it alone", async () => {
    // A +1 heavy steel shield, whose +1 is its item's modifier on the shield bonus
    const bjorn = await buildCarrying("Bjorn Ironhand", [
      { item: "Absorbing Shield", location: "Off Hand", weaponSet: 0 },
      { item: "Greatsword", location: "Two Handed", weaponSet: 1 },
    ]);
    const { weaponsets } = bjorn.components.combat.getCombat();
    expect([weaponsets["0"].ac.shield, weaponsets["1"].ac.shield]).toEqual([3, 0]);
    expect(armorClasses(bjorn)).toMatchObject({ "0": { total: 15 }, "1": { total: 12 } });
  });

  test("gives a monk his AC bonus in each set holding no shield, though another set holds one", async () => {
    // Monk 3: DEX 16 (+3), WIS 16 (+3); a light steel shield, +1, in the second set
    const zen = await buildCarrying("Zen Whitepetal", [
      { item: "Light Steel Shield", location: "Off Hand", weaponSet: 1 },
    ]);
    const { weaponsets } = zen.components.combat.getCombat();
    expect(weaponsets["0"].ac).toMatchObject({ misc: 3, shield: 0, total: 16 });
    expect(weaponsets["1"].ac).toMatchObject({ misc: 0, shield: 1, total: 14 });
    // His Wisdom's bonus, applied to the first set's armor class alone
    const applied = zen.modifierEvaluator.getModifiers().appliedModifiers.filter((m) => m.value.includes("wisdom"));
    expect(applied.map((m) => m.target)).toEqual(["combat.weaponsets.0.ac.misc"]);
  });

  test("reads the shield held by its set for a gate on the armor class, by any set for another (the speed's)", async () => {
    await unshieldedRaceBonus("Bjorn Ironhand", "combat.ac.deflection", "1");
    await unshieldedRaceBonus("Bjorn Ironhand", "combat.speed.base", "10");
    const bjorn = await buildCarrying("Bjorn Ironhand", [
      { item: "Longsword", location: "Main Hand", weaponSet: 0 },
      { item: "Heavy Steel Shield", location: "Off Hand", weaponSet: 1 },
    ]);
    const { weaponsets, speed } = bjorn.components.combat.getCombat();
    expect([weaponsets["0"].ac.deflection, weaponsets["1"].ac.deflection]).toEqual([1, 0]);
    // A shield carried in any set loses the speed's: the worst case
    expect(speed.total).toBe(30);
  });

  test("is what each set's armor class paths read, met when any set's meets a requirement", async () => {
    const bjorn = await buildCarrying("Bjorn Ironhand", SWORD_AND_BOARD);
    expect(
      [
        atLeast("combat.weaponsets.*.ac.total", 14),
        atLeast("combat.weaponsets.*.ac.total", 15),
        atLeast("combat.weaponsets.*.ac.flatfooted", 12),
        atLeast("combat.weaponsets.*.ac.touch", 13),
      ].map((groups) => bjorn.areRequirementsMet(groups)),
    ).toEqual([true, false, true, false]);
  });
});

describe("a weapon set's attacks", () => {
  test("pay the check penalty only of the shield their set holds without proficiency", async () => {
    // A wizard, proficient with no shield: the heavy steel shield costs the longsword 2, not the greatsword
    const { weaponsets } = (await buildCarrying("Elara Starweaver", SWORD_AND_BOARD)).components.combat.getCombat();
    expect([weaponsets["0"].mainhand!.tohit.gearpenalty, weaponsets["1"].twohanded!.tohit.gearpenalty]).toEqual([
      -2, 0,
    ]);
  });

  test("pay a tower shield's 2, and its check penalty without proficiency, only in its set", async () => {
    const gear = async (name: string) => {
      const { weaponsets } = (
        await buildCarrying(name, [
          { item: "Dagger", location: "Main Hand", weaponSet: 0 },
          { item: "Dagger", location: "Main Hand", weaponSet: 1 },
          { item: "Tower Shield", location: "Off Hand", weaponSet: 1 },
        ])
      ).components.combat.getCombat();
      return [weaponsets["0"].mainhand!.tohit.gearpenalty, weaponsets["1"].mainhand!.tohit.gearpenalty];
    };
    // A fighter, proficient with it; a wizard, who isn't, takes its 10 as well
    expect([await gear("Bjorn Ironhand"), await gear("Elara Starweaver")]).toEqual([
      [0, -2],
      [0, -12],
    ]);
  });

  test("finessed, pay the check penalty only of the shield their set holds", async () => {
    // An elf rogue with Weapon Finesse: STR 10 (+0), DEX 20 (+5), proficient with shields through a charm
    const charm = await createTestItem({ name: "Shield Charm", type: "Wondrous Item", slot: "Neck" });
    await Modifiers.create(db, {
      sourceId: charm.id,
      sourceType: "items",
      target: "feats.shieldproficiency.possessed",
      value: "true",
      valueType: "boolean",
      operator: "set",
    });
    invalidateSeededRuleset((await getSeedCtx()).rulesetId);
    const lyra = await buildCarrying("Lyra Shadowstep", [
      { item: charm.id, location: "Neck" },
      { item: "Rapier", location: "Main Hand", weaponSet: 0 },
      { item: "Heavy Steel Shield", location: "Off Hand", weaponSet: 0 },
      { item: "Rapier", location: "Main Hand", weaponSet: 1 },
    ]);
    const { weaponsets } = lyra.components.combat.getCombat();
    expect([weaponsets["0"].mainhand!.tohit.strength, weaponsets["1"].mainhand!.tohit.strength]).toEqual([3, 5]);
  });
});

describe("the skills", () => {
  test("take the check penalty of the worst set's shield, a shield in any set weighing on them", async () => {
    // A heavy steel shield (-2) in the first set, a tower shield (-10) in the second: Climb takes the tower's alone
    const bjorn = await buildCarrying("Bjorn Ironhand", [
      { item: "Heavy Steel Shield", location: "Off Hand", weaponSet: 0 },
      { item: "Tower Shield", location: "Off Hand", weaponSet: 1 },
    ]);
    expect(bjorn.components.skills.getSkills().climb.weight).toBe(10);
  });
});

describe("the sheet", () => {
  test("lists each weapon set's AC, touch and flat-footed beside what it holds and its attacks, a shield alone too", async () => {
    const bjorn = await buildCarrying("Bjorn Ironhand", [
      ...SWORD_AND_BOARD,
      { item: "Light Wooden Shield", location: "Off Hand", weaponSet: 2 },
    ]);
    const { weaponSets, hasWeaponSets } = CombatSheet.describe(bjorn.components.combat);
    expect(hasWeaponSets).toBe(true);
    expect(
      weaponSets.map(({ set, ac, held, weapons }) => ({ set, ac, held, weapons: weapons.map(({ name }) => name) })),
    ).toEqual([
      {
        set: 0,
        ac: { total: 14, touch: 12, flatfooted: 12 },
        held: ["Longsword", "Heavy Steel Shield"],
        weapons: ["Longsword"],
      },
      { set: 1, ac: { total: 12, touch: 12, flatfooted: 10 }, held: ["Greatsword"], weapons: ["Greatsword"] },
      { set: 2, ac: { total: 13, touch: 12, flatfooted: 11 }, held: ["Light Wooden Shield"], weapons: [] },
    ]);
  });

  test("shows a character holding nothing in a hand one loadout, which strikes unarmed, with no set's heading", async () => {
    const bjorn = await buildCarrying("Bjorn Ironhand", [{ item: "Chain Mail", location: "Torso" }]);
    const { weaponSets, hasWeaponSets } = CombatSheet.describe(bjorn.components.combat);
    expect(hasWeaponSets).toBe(false);
    expect(weaponSets.map(({ set, held, weapons }) => [set, held, weapons.map(({ name }) => name)])).toEqual([
      [0, [], ["Unarmed Strike"]],
    ]);
  });

  test("answers each weapon set's armor class in the character's description", async () => {
    const bjorn = await findSeededCharacter("Bjorn Ironhand");
    await carry(bjorn, SWORD_AND_BOARD);
    const { combat } = await CharactersService.getCharacter(makeSession(), bjorn.id);
    expect(combat.weaponSets.map(({ set, ac, held }) => [set, ac, held])).toEqual([
      [0, { total: 14, touch: 12, flatfooted: 12 }, ["Longsword", "Heavy Steel Shield"]],
      [1, { total: 12, touch: 12, flatfooted: 10 }, ["Greatsword"]],
    ]);
    expect("ac" in combat).toBe(false);
  });
});
