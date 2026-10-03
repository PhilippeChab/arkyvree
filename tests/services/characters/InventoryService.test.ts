import { describe, expect, test } from "bun:test";

import type { InferInsertModel } from "drizzle-orm";

import type { itemsInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { db } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { Items, Modifiers, Properties, Races, Requirements } from "@/server/repositories/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import type { ItemLocation, SizeType } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";
import {
  createSeededTestRuleset,
  createTestRuleset,
  createTestUser,
  getSeedCtx,
  NIL_UUID,
  uniqueId,
} from "@/tests/helpers.ts";

type Placement = {
  quantity?: number;
  equipped?: boolean;
  location?: ItemLocation | null;
  weaponSet?: number | null;
  charges?: [number | null, number | null];
  force?: boolean;
};

const add = (
  session: Session,
  characterId: string,
  itemId: string,
  {
    quantity = 1,
    equipped = false,
    location = null,
    weaponSet = null,
    charges = [null, null],
    force = false,
  }: Placement = {},
) =>
  CharacterInventoryService.addItem(
    session,
    characterId,
    itemId,
    quantity,
    equipped,
    location,
    charges[0],
    charges[1],
    weaponSet,
    force,
  );

const update = (
  session: Session,
  characterId: string,
  itemId: string,
  {
    quantity = 1,
    equipped = false,
    location = null,
    weaponSet = null,
    charges = [null, null],
    force = false,
  }: Placement = {},
  updatedAt?: string,
) =>
  CharacterInventoryService.updateItem(
    session,
    characterId,
    itemId,
    quantity,
    equipped,
    location,
    charges[0],
    charges[1],
    weaponSet,
    force,
    updatedAt,
  );

const equipped = (location: ItemLocation, weaponSet: number | null = null): Placement => ({
  equipped: true,
  location,
  weaponSet,
});

/** A new item of the ruleset, with these properties. */
async function createItem(
  rulesetId: string,
  values: Partial<InferInsertModel<typeof itemsInRules>> = {},
  properties: Record<string, string> = {},
) {
  const [item] = await Items.create(db, {
    rulesetId,
    name: `Test Item ${uniqueId()}`,
    weight: "5",
    costGp: "10",
    ...values,
  });
  const entries = Object.entries(properties);
  if (entries.length > 0)
    await Properties.createMany(
      db,
      entries.map(([type, value]) => ({ entityId: item.id, entityType: "items", type, value })),
    );
  invalidateRuleset(rulesetId);
  return item;
}

/** A human character of the seeded ruleset (or of `values`' ruleset and race). */
async function createCharacter(session: Session, values: { rulesetId?: string; raceId?: string } = {}) {
  const { rulesetId, raceMap } = await getSeedCtx();
  return CharactersService.createCharacter(session, {
    rulesetId,
    raceId: raceMap.pc["Human"],
    name: `Test Character ${uniqueId()}`,
    xp: 0,
    alignment: "Lawful Good",
    abilities: {},
    age: 25,
    gender: "Male",
    height: "6'0\"",
    weight: "180 lbs",
    ...values,
  });
}

/** A new user's character on their fork of the seeded ruleset, whose items the test makes. */
async function setup(race?: { size: SizeType }) {
  const { user, session } = await createTestUser();
  const ruleset = await createSeededTestRuleset(user.id);
  const raceId =
    race &&
    (await Races.create(db, { name: `Test Race ${uniqueId()}`, rulesetId: ruleset.id, baseSpeed: 30, ...race }))[0].id;
  invalidateRuleset(ruleset.id);
  const character = await createCharacter(
    session,
    raceId ? { rulesetId: ruleset.id, raceId } : { rulesetId: ruleset.id },
  );
  const newItem = (values?: Partial<InferInsertModel<typeof itemsInRules>>, properties?: Record<string, string>) =>
    createItem(ruleset.id, values, properties);
  return { session, character, newItem, item: await newItem() };
}

describe("InventoryService", () => {
  test("lists what the character carries with each item's customizations, removed items gone, archived characters included", async () => {
    const { session, character, item, newItem } = await setup();
    expect(await CharacterInventoryService.getInventory(session, character.id)).toEqual([]);
    await Properties.create(db, {
      entityId: item.id,
      entityType: "items",
      type: "WEAPON_PROFICIENCY",
      value: "Martial",
    });
    await Modifiers.create(db, {
      sourceId: item.id,
      sourceType: "items",
      target: "combat.bab",
      value: "1",
      valueType: "number",
      operator: "add",
    });
    await Requirements.create(db, {
      entityId: item.id,
      entityType: "items",
      level: "1",
      target: "abilities.strength.misc",
      value: "13",
      valueType: "number",
      operator: "greater_than_or_equal",
    });
    invalidateRuleset(character.rulesetId);
    const removed = await newItem();
    await add(session, character.id, item.id, { quantity: 3 });
    await add(session, character.id, removed.id);
    expect(await CharacterInventoryService.removeItem(session, character.id, removed.id)).toEqual({ success: true });

    const expected = [
      {
        itemId: item.id,
        quantity: 3,
        equipped: false,
        item: {
          name: item.name,
          properties: [{ type: "WEAPON_PROFICIENCY" }],
          modifiers: [{ target: "combat.bab" }],
          requirements: [{ target: "abilities.strength.misc" }],
        },
      },
    ];
    expect(await CharacterInventoryService.getInventory(session, character.id)).toMatchObject(expected);
    await CharactersService.archiveCharacter(session, character.id);
    expect(await CharacterInventoryService.getInventory(session, character.id)).toMatchObject(expected);
  });

  describe("adding and changing an item", () => {
    test("carries it or equips it in a slot, with charges; only equipped items have a slot", async () => {
      const { session, character, item, newItem } = await setup();
      const [ring, wand] = [await newItem(), await newItem()];
      expect(await add(session, character.id, item.id, { quantity: 5, location: "Trinket" })).toMatchObject({
        characterId: character.id,
        itemId: item.id,
        quantity: 5,
        equipped: false,
        location: null,
      });
      expect(await add(session, character.id, ring.id, equipped("Trinket"))).toMatchObject({
        equipped: true,
        location: "Trinket",
      });
      expect(await add(session, character.id, wand.id, { charges: [50, 50] })).toMatchObject({
        totalCharges: 50,
        remainingCharges: 50,
      });

      expect(await update(session, character.id, item.id, { quantity: 10 })).toMatchObject({ quantity: 10 });
      expect(await update(session, character.id, item.id, equipped("Waist"))).toMatchObject({
        equipped: true,
        location: "Waist",
      });
      expect(await update(session, character.id, ring.id)).toMatchObject({ equipped: false, location: null });
      expect(await update(session, character.id, wand.id, { charges: [50, 30] })).toMatchObject({
        totalCharges: 50,
        remainingCharges: 30,
      });
    });

    test("refuses charges without both counts, or with more left than in all", async () => {
      const { session, character, item } = await setup();
      for (const charges of [
        [10, 20],
        [10, null],
        [null, 5],
      ] as [number | null, number | null][]) {
        await expect(add(session, character.id, item.id, { charges })).rejects.toThrow(BadRequestError);
      }
      await add(session, character.id, item.id, { charges: [10, 10] });
      await expect(update(session, character.id, item.id, { charges: [10, 20] })).rejects.toThrow(BadRequestError);
    });

    test("refuses an item carried already, a missing item and changes to one not carried", async () => {
      const { session, character, item } = await setup();
      await add(session, character.id, item.id);
      await expect(add(session, character.id, item.id)).rejects.toThrow(BadRequestError);
      await expect(add(session, character.id, NIL_UUID)).rejects.toThrow(NotFoundError);
      await expect(update(session, character.id, NIL_UUID)).rejects.toThrow(NotFoundError);
      await expect(CharacterInventoryService.removeItem(session, character.id, NIL_UUID)).rejects.toThrow(
        NotFoundError,
      );
    });

    test("refuses a missing character, another user's, and changes to an archived one", async () => {
      const { session, character, item, newItem } = await setup();
      const { session: other } = await createTestUser();
      await add(session, character.id, item.id);
      const calls = (s: Session, characterId: string) => [
        () => CharacterInventoryService.getInventory(s, characterId),
        () => add(s, characterId, item.id),
        () => update(s, characterId, item.id),
        () => CharacterInventoryService.removeItem(s, characterId, item.id),
      ];
      // One at a time: the test's transaction has a single connection.
      for (const call of [...calls(session, NIL_UUID), ...calls(other, character.id)])
        await expect(call()).rejects.toThrow(NotFoundError);

      await CharactersService.archiveCharacter(session, character.id);
      await expect(add(session, character.id, (await newItem()).id)).rejects.toThrow(NotFoundError);
      await expect(update(session, character.id, item.id, { quantity: 2 })).rejects.toThrow(NotFoundError);
    });

    test("refuses an edit started from a stale copy", async () => {
      const { session, character, item } = await setup();
      const added = await add(session, character.id, item.id);
      await update(session, character.id, item.id, { quantity: 2 }, added.updatedAt);
      await expect(update(session, character.id, item.id, { quantity: 3 }, added.updatedAt)).rejects.toThrow(
        ConflictError,
      );
    });

    test("takes an item the character's ruleset inherits, however far up, and not one of an unrelated ruleset", async () => {
      const { user, session } = await createTestUser();
      const { user: author } = await createTestUser();
      const grandparent = await createTestRuleset(author.id, { status: "Published" });
      const [race] = await Races.create(db, {
        name: "Test Race",
        rulesetId: grandparent.id,
        size: "Medium",
        baseSpeed: 30,
      });
      const inherited = await createItem(grandparent.id);
      // Forks of forks can't be made through the API, but the lineage check walks every ancestor.
      const parent = await createTestRuleset(author.id, {
        rulesetId: grandparent.id,
        ancestorRulesetIds: [grandparent.id],
        status: "Published",
      });
      for (const ruleset of [
        await createTestRuleset(user.id, { rulesetId: grandparent.id, ancestorRulesetIds: [grandparent.id] }),
        await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id, grandparent.id] }),
      ]) {
        const character = await createCharacter(session, { rulesetId: ruleset.id, raceId: race.id });
        expect(await add(session, character.id, inherited.id)).toMatchObject({ itemId: inherited.id });
      }

      // A character of the seeded ruleset: the item's ruleset is unrelated to it.
      const onSeed = await createCharacter(session);
      await expect(add(session, onSeed.id, inherited.id)).rejects.toThrow(BadRequestError);
    });
  });

  describe("equipping", () => {
    test("puts weapons in hands, body armor on the torso and shields in the off hand", async () => {
      const { session, character, newItem } = await setup();
      const [weapon, armor, shield] = [
        await newItem({ type: "Weapon" }),
        await newItem({ type: "Armor" }),
        await newItem({ type: "Shield" }),
      ];
      await expect(add(session, character.id, weapon.id, equipped("Trinket"))).rejects.toThrow(
        "Weapons can only be equipped in hand slots",
      );
      await expect(add(session, character.id, armor.id, equipped("Head"))).rejects.toThrow(
        "Body armor can only be equipped in the Torso slot",
      );
      await expect(add(session, character.id, shield.id, equipped("Head"))).rejects.toThrow(
        "Shields can only be equipped in the Off Hand slot",
      );
      // A hand holds weapons and shields only, and a shield only the off hand
      await expect(add(session, character.id, armor.id, equipped("Main Hand", 0))).rejects.toThrow(
        "Body armor can only be equipped in the Torso slot",
      );
      await expect(add(session, character.id, shield.id, equipped("Main Hand", 0))).rejects.toThrow(
        "Shields can only be equipped in the Off Hand slot",
      );

      expect(await add(session, character.id, armor.id, equipped("Torso"))).toMatchObject({
        equipped: true,
        location: "Torso",
      });
      expect(await add(session, character.id, shield.id, equipped("Off Hand", 0))).toMatchObject({
        equipped: true,
        location: "Off Hand",
      });
    });

    test("needs a weapon set for a hand slot", async () => {
      const { session, character, item, newItem } = await setup();
      const shield = await newItem({ type: "Shield" });
      const message = "A weapon set is required when equipping to a hand slot";
      await expect(add(session, character.id, item.id, equipped("Main Hand"))).rejects.toThrow(message);
      await expect(add(session, character.id, shield.id, equipped("Off Hand"))).rejects.toThrow(message);
      await add(session, character.id, item.id);
      await expect(update(session, character.id, item.id, equipped("Main Hand"))).rejects.toThrow(message);
    });

    test("fills each slot once per weapon set, a two-handed weapon taking both hands, and two rings", async () => {
      const { session, character, newItem } = await setup();
      const items = [];
      for (let i = 0; i < 9; i++) items.push((await newItem()).id);
      const [helm, otherHelm, sword, greatsword, otherGreatsword, dagger, ...rings] = items;
      const equip = (itemId: string, placement: Placement) => add(session, character.id, itemId, placement);

      await equip(helm, equipped("Head"));
      await expect(equip(otherHelm, equipped("Head"))).rejects.toThrow(BadRequestError);

      await equip(sword, equipped("Main Hand", 0));
      await expect(equip(greatsword, equipped("Two Handed", 0))).rejects.toThrow(BadRequestError);
      expect(await equip(greatsword, equipped("Two Handed", 1))).toMatchObject({
        location: "Two Handed",
        weaponSet: 1,
      });
      await expect(equip(otherGreatsword, equipped("Two Handed", 1))).rejects.toThrow(
        '"Two Handed" is already occupied in this weapon set',
      );
      await expect(equip(dagger, equipped("Main Hand", 1))).rejects.toThrow(BadRequestError);
      expect(await equip(otherGreatsword, equipped("Two Handed", 2))).toMatchObject({ weaponSet: 2 });
      // A weapon doesn't block its own slot.
      expect(
        await update(session, character.id, greatsword, { ...equipped("Two Handed", 1), quantity: 2 }),
      ).toMatchObject({ quantity: 2 });

      await equip(dagger, equipped("Off Hand", 0));
      const [first, second, third] = rings;
      await equip(first, equipped("Finger"));
      await equip(second, equipped("Finger"));
      await expect(equip(third, equipped("Finger"))).rejects.toThrow(BadRequestError);
      await expect(update(session, character.id, dagger, equipped("Off Hand", 0))).resolves.toMatchObject({
        location: "Off Hand",
      });
    });

    test.each([
      ["Medium", "Medium", "Main Hand", "allowed"],
      ["Large", "Medium", "Off Hand", "allowed"],
      ["Medium", "Large", "Two Handed", "allowed"],
      ["Medium", "Large", "Main Hand", "This weapon requires two hands for a character of this size"],
      ["Medium", "Large", "Off Hand", "This weapon requires two hands for a character of this size"],
      ["Medium", "Huge", "Two Handed", "Weapon is too large for this character"],
      ["Medium", "unsized", "Main Hand", "allowed"],
    ] as const)(
      "lets a %s character wield a %s weapon in the %s: %s",
      async (characterSize, weaponSize, slot, outcome) => {
        const { session, character, newItem } = await setup({ size: characterSize });
        const weapon = await newItem(
          {},
          weaponSize === "unsized" ? {} : { WEAPON_PROFICIENCY: "Martial", WEAPON_SIZE: weaponSize },
        );

        const attempt = add(session, character.id, weapon.id, equipped(slot, 0));
        if (outcome === "allowed") expect(await attempt).toMatchObject({ equipped: true, location: slot });
        else await expect(attempt).rejects.toThrow(outcome);
      },
    );

    test("refuses an item whose requirements the character doesn't meet, unless forced", async () => {
      const { session, character, newItem } = await setup();
      const armor = await newItem({ type: "Armor" });
      await Requirements.create(db, {
        entityId: armor.id,
        entityType: "items",
        level: "1",
        target: "abilities.strength.misc",
        value: "30",
        valueType: "number",
        operator: "greater_than_or_equal",
      });
      invalidateRuleset(character.rulesetId);

      await expect(add(session, character.id, armor.id, equipped("Torso"))).rejects.toThrow(BadRequestError);
      expect(await add(session, character.id, armor.id, { ...equipped("Torso"), force: true })).toMatchObject({
        equipped: true,
        location: "Torso",
      });
    });
  });
});
