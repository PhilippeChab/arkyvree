import { describe, expect, test } from "bun:test";

import BestOfSources from "@/engine/core/modifiers/BestOfSources.ts";

/** An armor class's deflection, defined as keeping the best of its sources. */
function deflection() {
  const ac = { deflection: 0 };
  BestOfSources.define(ac, "deflection", 0);
  return ac;
}

describe("A value that keeps the best of its sources", () => {
  test("counts each source's sum, the best bonus and the worst penalty", () => {
    const ac = deflection();
    BestOfSources.add(ac, "deflection", "ring", 1);
    BestOfSources.add(ac, "deflection", "cloak", 2);
    expect(ac.deflection).toBe(2);
    // One source's own modifiers add up: the ring's +1 and +2, 3
    BestOfSources.add(ac, "deflection", "ring", 2);
    expect(ac.deflection).toBe(3);
    // Two penalties: the worst one, −3, beside the best bonus
    BestOfSources.add(ac, "deflection", "curse", -1);
    BestOfSources.add(ac, "deflection", "hex", -3);
    expect(ac.deflection).toBe(0);
  });

  test("counts what a source holds before its modifiers, a worn armor's, with them", () => {
    const worn = new Map([["chainShirt", 4]]);
    const ac = { armor: 0 };
    BestOfSources.define(ac, "armor", 0, { bases: () => worn });
    expect(ac.armor).toBe(4);
    // The shirt's own +1 joins its 4; Bracers of Armor +5 beat the 5 they make, +3 don't
    BestOfSources.add(ac, "armor", "chainShirt", 1);
    BestOfSources.add(ac, "armor", "bracers", 3);
    expect(ac.armor).toBe(5);
    BestOfSources.add(ac, "armor", "bracers", 3);
    expect(ac.armor).toBe(6);
  });

  test("makes what it's set to a source, which a later add competes with", () => {
    const ac = { armor: 0 };
    BestOfSources.define(ac, "armor", 0, { bases: () => new Map([["chainShirt", 4]]) });
    // Set to 0, then Bracers of Armor +5: the bracers'
    ac.armor = 0;
    BestOfSources.add(ac, "armor", "bracers", 5);
    expect(ac.armor).toBe(5);
    // Set to 8, then the bracers' +5 again: the 8
    ac.armor = 8;
    BestOfSources.add(ac, "armor", "bracers", 5);
    expect(ac.armor).toBe(8);
    // A creature's natural armor its stat block assigns, beside a +1 natural armor bonus: the best
    const creature = { natural: 0 };
    BestOfSources.define(creature, "natural", 0);
    creature.natural = 4;
    BestOfSources.add(creature, "natural", "feat", 1);
    expect(creature.natural).toBe(4);
  });

  test("shares its parent's sources, read live: a weapon set's deflection and the character's", () => {
    const shared = deflection();
    const set = { deflection: 0 };
    BestOfSources.define(set, "deflection", 0, { parent: { key: "deflection", object: () => shared } });
    BestOfSources.add(shared, "deflection", "ring", 1);
    BestOfSources.add(set, "deflection", "heldShield", 3);
    expect([shared.deflection, set.deflection]).toEqual([1, 3]);
    // A shared bonus added later still competes with the set's own
    BestOfSources.add(shared, "deflection", "cloak", 4);
    expect([shared.deflection, set.deflection]).toEqual([4, 4]);
  });

  test("counts only while it says it does: a shield enhancement without a shield", () => {
    let held = false;
    const set = { shieldenhancement: 0 };
    BestOfSources.define(set, "shieldenhancement", 0, { when: () => held });
    BestOfSources.add(set, "shieldenhancement", "feat", 1);
    expect(set.shieldenhancement).toBe(0);
    held = true;
    expect(set.shieldenhancement).toBe(1);
  });

  test("leaves any other value alone", () => {
    const ac = { dodge: 0, deflection: 0 };
    BestOfSources.define(ac, "deflection", 0);
    expect([BestOfSources.keepsBest(ac, "deflection"), BestOfSources.keepsBest(ac, "dodge")]).toEqual([true, false]);
    // Not enumerable: the object lists as before
    expect(Object.keys(ac)).toEqual(["dodge", "deflection"]);
  });
});
