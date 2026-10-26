import { describe, expect, test } from "bun:test";

import type { OwnerFields } from "@/engine/core/module/index.ts";
import CharacterResponse from "@/engine/rulesets/dnd3.5/characters/description/CharacterResponse.ts";
import { ITEM_FIELDS } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import type { Item } from "@/engine/rulesets/dnd3.5/index.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { db } from "@/server/database/index.ts";
import { CharacterInventory, Entities, Sessions, Users } from "@/server/repositories/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { createSeededTestRuleset, type Described } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { ITEM_COST_GP, ITEM_TYPE, ITEM_WEIGHT, WEAPON_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";

async function setup() {
  const user = await Users.findOne(db, { emailAddress: "testuser1@example.com" });
  if (!user) throw new Error("Seed user not found");
  const [session] = await Sessions.create(db, { userId: user.id });
  const ruleset = await createSeededTestRuleset(user.id);
  const seed = await getSeedCtx();
  const item = await Entities.findOne<Item>(db, { entityType: "items", rulesetId: seed.rulesetId, name: "Heavy Mace" });
  if (!item) throw new Error("Seed item not found");

  const character = await CharactersService.createCharacter(session, {
    rulesetId: ruleset.id,
    picks: { race: seed.raceMap.pc["Human"] },
    scores: {},
    name: "Inventory override regression",
    fields: {
      xp: 0,
      alignment: "Lawful Good",
      age: 25,
      gender: "Male",
      height: "180 cm",
      weight: "80 kg",
    },
  });
  await CharacterInventoryService.addItem(session, character.id, item.id, 2, true, "Main Hand", null, null, [0]);
  return { session, ruleset, item, character };
}

describe("COW inventory item details", () => {
  for (const view of ["editable inventory", "character sheet"] as const) {
    test(`${view} displays updated fork details for an item added before the override`, async () => {
      const { session, ruleset, item, character } = await setup();
      const readInventory = async () => {
        if (view === "editable inventory") return CharacterInventoryService.getInventory(session, character.id);

        const detailedCharacter = await buildAs(DetailedCharacter, character);
        return detailedCharacter.components.inventory.getFlatInventory();
      };

      expect((await readInventory())[0].item.name).toBe(item.name);
      const updated = await EntitiesService.updateEntity(session, ruleset.id, "items", item.id, {
        name: "Forked war mace",
        description: "A renamed mace in this fork.",
        fields: { [ITEM_TYPE]: "Weapon", [ITEM_WEIGHT]: 12, [ITEM_COST_GP]: 30 },
      });
      expect(updated.id).not.toBe(item.id);

      const [entry] = await readInventory();
      expect(entry.itemId).toBe(updated.id);
      expect(entry.item).toMatchObject({
        id: updated.id,
        name: updated.name,
        description: updated.description,
        fields: { [ITEM_WEIGHT]: 12, [ITEM_COST_GP]: 30, [ITEM_TYPE]: "Weapon" },
      });
      expect(entry).toMatchObject({ quantity: 2, equipped: true, location: "Main Hand", groups: [0] });
      // Its fields, its template's of each it holds none of: the inventory's by field, as an item's page reads them, the
      // sheet's as the view holds them
      const held = entry.item.fields as OwnerFields;
      const fields = view === "character sheet" ? ITEM_FIELDS.readByField({ fields: held, links: {} }) : held;
      expect(fields[WEAPON_TYPE]).toBe("Heavy Mace");
      const described = await EntitiesService.getEntity<Described<"items">>(ruleset.id, "items", updated.id);
      expect(fields).toEqual(described.fields);

      // Reading a fork does not rewrite the pick or change the parent item.
      const [stored] = await CharacterInventory.findMany(db, { characterId: character.id });
      expect(stored?.itemId).toBe(item.id);
      const parent = await EntitiesService.getEntity(item.rulesetId, "items", item.id);
      expect(parent.name).toBe(item.name);
      expect(parent.description).toBe(item.description);
    });
  }

  test("campaign/shared character equipment uses the override's name and description", async () => {
    const { session, ruleset, item, character } = await setup();
    const updated = await EntitiesService.updateEntity(session, ruleset.id, "items", item.id, {
      name: "Campaign war mace",
      description: "Campaign-specific equipment description.",
      fields: { [ITEM_TYPE]: "Weapon" },
    });
    const detailedCharacter = await buildAs(DetailedCharacter, character);

    const response = CharacterResponse.buildSheet(character, detailedCharacter);
    expect(response.equipment[0]).toMatchObject({
      itemId: updated.id,
      name: updated.name,
      description: updated.description,
    });
  });
});
