import { describe, expect, test } from "bun:test";

import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { db } from "@/server/database/index.ts";
import { Modifiers, Requirements } from "@/server/repositories/index.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { type Carried, carry, createTestItem } from "@/tests/support/dnd3.5/items.ts";
import { invalidateSeededRuleset } from "@/tests/support/rulesets.ts";
import { findSeededCharacter, getSeedCtx } from "@/tests/support/seed.ts";
import { ITEM_SLOT, ITEM_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A requirement's values: no shield held, which a weapon set's armor class reads in its own set. */
const NO_SHIELD_HELD = { target: "combat.shield.held", operator: "equal", value: "false", valueType: "boolean" };

/** Bjorn Ironhand (a fighter, Dexterity 14), carrying only these items, built. */
async function bjornCarrying(carried: Carried[]) {
  const character = await findSeededCharacter("Bjorn Ironhand");
  await carry(character, carried);
  return buildAs(DetailedCharacter, character);
}

/**
 * A new ring, worn on a finger, whose modifiers add to these targets (`bonuses`, each its amount: a negative one a
 * penalty), each gated by `requirements` when given.
 */
async function ringGiving(
  bonuses: Record<string, number>,
  requirements: (typeof NO_SHIELD_HELD)[] = [],
  worn: { slot: string; type: string } = { slot: "Finger", type: "Ring" },
) {
  const ring = await createTestItem({}, { [ITEM_TYPE]: worn.type, [ITEM_SLOT]: worn.slot });
  for (const [target, amount] of Object.entries(bonuses)) {
    const [modifier] = await Modifiers.create(db, {
      sourceId: ring.id,
      sourceType: "items",
      target,
      operator: amount < 0 ? "subtract" : "add",
      value: String(Math.abs(amount)),
      valueType: "number",
    });
    for (const [index, requirement] of requirements.entries()) {
      await Requirements.create(db, {
        entityId: modifier.id,
        entityType: "modifiers",
        level: String(index + 1),
        ...requirement,
      });
    }
  }
  invalidateSeededRuleset((await getSeedCtx()).rulesetId);
  return ring.id;
}

describe("Bonuses of one type to AC", () => {
  test("don't stack: a Ring of Protection +1 and a +2 deflection bonus give +2", async () => {
    const other = await ringGiving({ "combat.ac.deflection": 2 });
    const bjorn = await bjornCarrying([
      { item: "Ring of Protection +1", location: "Finger" },
      { item: other, location: "Finger" },
    ]);
    const { ac } = bjorn.components.combat.getCombat();
    // 10, Dexterity's +2, the best deflection bonus
    expect([ac.deflection, bjorn.components.combat.getCombat().weaponsets["0"].ac.total]).toEqual([2, 14]);
  });

  test("count an armor's own enhancement in its armor bonus, the best armor bonus counting", async () => {
    // A chain shirt's +4 and Bracers of Armor +5: the bracers'
    const shirt = await bjornCarrying([
      { item: "Chain Shirt", location: "Torso" },
      { item: "Bracers of Armor +5", location: "Wrists" },
    ]);
    expect(shirt.components.combat.getCombat().ac.armor).toBe(5);
    // Rhino Hide, hide armor's +3 and its own +2 enhancement, beside Bracers of Armor +3: the armor's 5
    const hide = await bjornCarrying([
      { item: "Rhino Hide", location: "Torso" },
      { item: "Bracers of Armor +3", location: "Wrists" },
    ]);
    expect(hide.components.combat.getCombat().ac.armor).toBe(5);
  });

  test("keep natural armor's best, and add an enhancement bonus to natural armor to it", async () => {
    // A +1 natural armor bonus and an Amulet of Natural Armor +2's enhancement to it: both count
    const hide = await ringGiving({ "combat.ac.natural": 1 });
    const amulet = await bjornCarrying([
      { item: hide, location: "Finger" },
      { item: "Amulet of Natural Armor +2", location: "Neck" },
    ]);
    const { ac } = amulet.components.combat.getCombat();
    expect([ac.natural, ac.naturalenhancement]).toEqual([1, 2]);
    expect(amulet.components.combat.getCombat().weaponsets["0"].ac).toMatchObject({ total: 15, touch: 12 });
    // Two natural armor bonuses, +1 and +3: the best
    const thicker = await ringGiving({ "combat.ac.natural": 3 });
    const both = await bjornCarrying([
      { item: hide, location: "Finger" },
      { item: thicker, location: "Finger" },
    ]);
    expect(both.components.combat.getCombat().ac.natural).toBe(3);
  });

  test("add an enhancement bonus to armor to the armor bonus, outside touch AC", async () => {
    const enhanced = await ringGiving({ "combat.ac.armorenhancement": 1 });
    const bjorn = await bjornCarrying([
      { item: "Chain Shirt", location: "Torso" },
      { item: enhanced, location: "Finger" },
    ]);
    const { ac, weaponsets } = bjorn.components.combat.getCombat();
    expect([ac.armor, ac.armorenhancement]).toEqual([4, 1]);
    // 10, Dexterity's +2, the shirt's +4 and its +1 enhancement; touch AC without them
    expect(weaponsets["0"].ac).toMatchObject({ total: 17, touch: 12 });
  });

  test("add an enhancement bonus to a shield to the shield bonus, in a set that holds a shield alone", async () => {
    const enhanced = await ringGiving({ "combat.ac.shieldenhancement": 1 });
    const bjorn = await bjornCarrying([
      { item: enhanced, location: "Finger" },
      { item: "Longsword", location: "Main Hand", groups: [0] },
      { item: "Heavy Steel Shield", location: "Off Hand", groups: [0] },
      { item: "Greatsword", location: "Two Handed", groups: [1] },
    ]);
    const { weaponsets } = bjorn.components.combat.getCombat();
    // The heavy steel shield's +2 and the +1 enhancement in the first set; nothing to enhance in the second
    expect(weaponsets["0"].ac).toMatchObject({ shield: 2, shieldenhancement: 1, total: 15, touch: 12 });
    expect(weaponsets["1"].ac).toMatchObject({ shield: 0, shieldenhancement: 0, total: 12 });
  });

  test("but dodge bonuses stack, and a penalty still counts beside the best bonus", async () => {
    const dodges = [await ringGiving({ "combat.ac.dodge": 1 }), await ringGiving({ "combat.ac.dodge": 1 })];
    const dodging = await bjornCarrying(dodges.map((item) => ({ item, location: "Finger" })));
    expect(dodging.components.combat.getCombat().ac.dodge).toBe(2);
    // A Ring of Protection +1, and −1 and −2 deflection penalties: the best bonus and the worst penalty
    const cursed = await ringGiving({ "combat.ac.deflection": -1 });
    const hexed = await ringGiving({ "combat.ac.deflection": -2 }, [], { slot: "Neck", type: "Wondrous Item" });
    const penalized = await bjornCarrying([
      { item: "Ring of Protection +1", location: "Finger" },
      { item: cursed, location: "Finger" },
      { item: hexed, location: "Neck" },
    ]);
    expect(penalized.components.combat.getCombat().ac.deflection).toBe(-1);
  });

  test("don't stack across a weapon set and every set: a set's own deflection bonus against the ring's", async () => {
    // +3 deflection while no shield is held, the second set's alone; the ring's +1 in both
    const bare = await ringGiving({ "combat.ac.deflection": 3 }, [NO_SHIELD_HELD]);
    const bjorn = await bjornCarrying([
      { item: "Ring of Protection +1", location: "Finger" },
      { item: bare, location: "Finger" },
      { item: "Longsword", location: "Main Hand", groups: [0] },
      { item: "Heavy Steel Shield", location: "Off Hand", groups: [0] },
      { item: "Greatsword", location: "Two Handed", groups: [1] },
    ]);
    const { weaponsets } = bjorn.components.combat.getCombat();
    expect([weaponsets["0"].ac.deflection, weaponsets["1"].ac.deflection]).toEqual([1, 3]);
  });
});
