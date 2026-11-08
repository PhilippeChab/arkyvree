import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { CharacterInventory, Entities, Modifiers } from "@/server/repositories/index.ts";
import { buildCharacter, createPf1Character } from "@/tests/support/pf1/characters.ts";
import { addLevel } from "@/tests/support/pf1/levels.ts";
import { getPf1SeedCtx } from "@/tests/support/pf1/seed.ts";
import { invalidateSeededRuleset } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";
import { ITEM_SLOT, ITEM_TYPE } from "@/vocabulary/pf1/fields/index.ts";

const session = makeSession();

/** A new human fighter 1 (Dexterity 14) wearing these items (`worn`: each an item's id, at its slot). */
async function fighterWearing(worn: { item: string; location: string }[]) {
  const character = await createPf1Character(session, { abilities: { Dexterity: 14 } });
  await addLevel(session, character.id, "Fighter", 1, { hp: 10 }, true);
  await CharacterInventory.createMany(
    db,
    PF1_BASE_RULES,
    worn.map(({ item, location }) => ({ characterId: character.id, itemId: item, location, quantity: 1 })),
  );
  return buildCharacter(character.id);
}

/** A new ring whose modifiers add to these targets (`bonuses`, each its amount: a negative one a penalty). */
async function ringGiving(bonuses: Record<string, number>) {
  const { rulesetId } = await getPf1SeedCtx();
  const [ring] = await Entities.create(db, PF1_BASE_RULES, "items", {
    name: `Test Ring ${uniqueId()}`,
    rulesetId,
    fields: { [ITEM_TYPE]: "Ring", [ITEM_SLOT]: "Ring" },
  });
  for (const [target, amount] of Object.entries(bonuses)) {
    await Modifiers.create(db, {
      sourceId: ring.id,
      sourceType: "items",
      target,
      operator: amount < 0 ? "subtract" : "add",
      value: String(Math.abs(amount)),
      valueType: "number",
    });
  }
  invalidateSeededRuleset(rulesetId);
  return ring.id;
}

/** A seeded item's id, by its name. */
async function seededItem(name: string) {
  const { rulesetId } = await getPf1SeedCtx();
  const item = await Entities.findOne(db, { entityType: "items", name, rulesetId });
  if (!item) throw new Error(`No seeded item ${name}`);
  return item.id;
}

describe("A Pathfinder character's bonuses of one type to AC", () => {
  test("don't stack: a Ring of Protection +1 and a +2 deflection bonus give +2", async () => {
    const built = await fighterWearing([
      { item: await seededItem("Ring of Protection +1"), location: "Ring" },
      { item: await ringGiving({ "combat.ac.deflection": 2 }), location: "Ring" },
    ]);
    expect(built.components.combat.getCombat().ac.deflection).toBe(2);
  });

  test("keep the best armor bonus, and add an enhancement bonus to natural armor to natural armor", async () => {
    const built = await fighterWearing([
      { item: await seededItem("Chain Shirt"), location: "Torso" },
      { item: await seededItem("Bracers of Armor +5"), location: "Wrists" },
      { item: await ringGiving({ "combat.ac.natural": 1 }), location: "Ring" },
      { item: await seededItem("Amulet of Natural Armor +2"), location: "Neck" },
    ]);
    const { ac } = built.components.combat.getCombat();
    // The bracers' +5 over the chain shirt's +4; a +1 natural armor bonus and the amulet's +2 enhancement to it
    expect([ac.armor, ac.natural, ac.naturalenhancement]).toEqual([5, 1, 2]);
  });

  test("count a class's levels as one source: a dragon disciple's natural armor increase at 1st, 4th and 7th", async () => {
    const character = await createPf1Character(session, { abilities: { Strength: 13, Charisma: 13 } });
    // Forced past its picks, its 4th level's ability increase given
    for (let level = 1; level <= 7; level++) {
      const plan = { hp: 6, abilities: level === 4 ? ["Strength"] : [] };
      await addLevel(session, character.id, "Dragon Disciple", level, plan, true);
    }
    // Its 4th and 7th levels' +1 each, added up: its 1st's prerequisites, a prestige class's, unmet (a forced save) keep
    // that level's off
    expect((await buildCharacter(character.id)).components.combat.getCombat().ac.natural).toBe(2);
  });
});
