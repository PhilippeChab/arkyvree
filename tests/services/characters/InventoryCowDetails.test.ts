import { describe, expect, test } from "bun:test";
import { getSeedContext } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { CharacterInventory, Items, Sessions, Users } from "@/server/repositories/index.ts";
import DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import { buildFullCharacterResponse } from "@/server/rulesets/dnd3.5/buildCharacterResponse.ts";
import { CharactersMethods } from "@/server/services/CharactersService.ts";
import { CharacterInventoryMethods } from "@/server/services/characters/CharacterInventoryService.ts";
import { ItemsMethods } from "@/server/services/rulesets/ItemsService.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";

async function setup() {
  const user = await Users.findOne(db, { emailAddress: "testuser1@example.com" });
  if (!user) throw new Error("Seed user not found");
  const [session] = await Sessions.create(db, { userId: user.id });
  const ruleset = await createSeededTestRuleset(user.id);
  const seed = await getSeedContext(db);
  const item = await Items.findOne(db, { rulesetId: seed.rulesetId, name: "Heavy Mace" });
  if (!item) throw new Error("Seed item not found");

  const character = await CharactersMethods.createCharacter(session, {
    rulesetId: ruleset.id,
    raceId: seed.raceMap.pc["Human"],
    name: "Inventory override regression",
    xp: 0,
    alignment: "Lawful Good",
    abilities: {},
    age: 25,
    gender: "Male",
    height: "180 cm",
    weight: "80 kg",
  });
  await CharacterInventoryMethods.addItem(
    session, character.id, item.id, 2, true, "Main Hand", null, null, 0,
  );
  return { session, ruleset, item, character };
}

describe("COW inventory item details", () => {
  for (const view of ["editable inventory", "character sheet"] as const) {
    test(`${view} displays updated fork details for an item added before the override`, async () => {
      const { session, ruleset, item, character } = await setup();
      const readInventory = async () => {
        if (view === "editable inventory") {
          return CharacterInventoryMethods.getInventory(session, character.id);
        }
        const detailedCharacter = new DetailedCharacter(character);
        await detailedCharacter.build();
        return detailedCharacter.getDetailedCharacterInventory().getFlatInventory();
      };

      expect((await readInventory())[0].item.name).toBe(item.name);
      const updated = await ItemsMethods.updateRulesetItem(session, ruleset.id, item.id, {
        name: "Forked war mace",
        description: "A renamed mace in this fork.",
        type: "Weapon",
        weight: 12,
        costGp: 30,
      });
      expect(updated.id).not.toBe(item.id);

      const [entry] = await readInventory();
      expect(entry.itemId).toBe(updated.id);
      expect(entry.item).toMatchObject({
        id: updated.id,
        name: updated.name,
        description: updated.description,
        weight: "12.00",
        costGp: "30.00",
        type: "Weapon",
      });
      expect(entry).toMatchObject({ quantity: 2, equipped: true, location: "Main Hand", weaponSet: 0 });
      expect(entry.item.properties.length).toBeGreaterThan(0);

      // Reading a fork does not rewrite the pick or change the parent item.
      const stored = await CharacterInventory.findOne(db, { characterId: character.id, itemId: item.id });
      expect(stored?.itemId).toBe(item.id);
      const parent = await ItemsMethods.getRulesetItem(item.rulesetId, item.id);
      expect(parent.name).toBe(item.name);
      expect(parent.description).toBe(item.description);
    });
  }

  test("campaign/shared character equipment uses the override's name and description", async () => {
    const { session, ruleset, item, character } = await setup();
    const updated = await ItemsMethods.updateRulesetItem(session, ruleset.id, item.id, {
      name: "Campaign war mace",
      description: "Campaign-specific equipment description.",
      type: "Weapon",
    });
    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    const response = buildFullCharacterResponse(character, detailedCharacter);
    expect(response.equipment[0]).toMatchObject({
      itemId: updated.id,
      name: updated.name,
      description: updated.description,
    });
  });
});
