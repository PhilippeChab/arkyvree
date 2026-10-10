import { describe, expect, test } from "bun:test";

import type { InferInsertModel } from "drizzle-orm";

import type { itemsInRules } from "@/drizzle/schema.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { CharacterInventory, Modifiers, Properties, Races, Requirements } from "@/server/repositories/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import { ItemsService } from "@/server/services/rulesets/items/index.ts";
import type { ItemLocation, SizeType } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";
import { createCharacterAs } from "@/tests/support/characters.ts";
import { createTestItem } from "@/tests/support/items.ts";
import { createSeededTestRuleset, createTestRuleset } from "@/tests/support/rulesets.ts";
import { findPlainItem, findSeededCharacter, getSeedCtx, NIL_UUID, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";
import { WEAPON_PROFICIENCY, WEAPON_SIZE } from "@/vocabulary/dnd3.5/properties/index.ts";

interface Placement {
  charges?: [number | null, number | null];
  equipped?: boolean;
  force?: boolean;
  location?: ItemLocation | null;
  quantity?: number;
  weaponSet?: number | null;
}

/** What the test's items weigh and cost, unless a test says otherwise. */
const ITEM_VALUES = { weight: "5", costGp: "10" };

function add(
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
) {
  return CharacterInventoryService.addItem(
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
}

function equipped(location: ItemLocation, weaponSet: number | null = null): Placement {
  return {
    equipped: true,
    location,
    weaponSet,
  };
}

/** The character's entry of the item, by the item: a test carries each item once. An id it doesn't carry is its own. */
async function entryOf(characterId: string, itemId: string) {
  const entries = await CharacterInventory.findMany(db, { characterId });
  return entries.find((entry) => entry.itemId === itemId)?.id ?? itemId;
}

/** A character holding a helm, two rings, a longsword in set 1 and a greatsword in set 2. */
async function placed() {
  const { session, character, newItem } = await setup();
  const items = {
    helm: await newItem({ name: "Helm" }),
    protection: await newItem({ name: "Ring of Protection" }),
    wizardry: await newItem({ name: "Ring of Wizardry" }),
    longsword: await newItem({ name: "Longsword", type: "Weapon" }),
    greatsword: await newItem({ name: "Greatsword", type: "Weapon" }),
  };
  await add(session, character.id, items.helm.id, equipped("Head"));
  await add(session, character.id, items.protection.id, equipped("Finger"));
  await add(session, character.id, items.wizardry.id, equipped("Finger"));
  await add(session, character.id, items.longsword.id, equipped("Main Hand", 0));
  await add(session, character.id, items.greatsword.id, equipped("Two Handed", 1));
  const warning = async (location: ItemLocation, weaponSet: number, entryId: string | null = null) =>
    (await CharacterInventoryService.getPlacement(session, character.id, entryId, location, weaponSet)).warning;
  return { character, items, warning };
}

/** Removes the character's entry of the item. */
async function remove(session: Session, characterId: string, itemId: string) {
  return CharacterInventoryService.removeItem(session, characterId, await entryOf(characterId, itemId));
}

/** A new user's character on their fork of the seeded ruleset, whose items the test makes. */
async function setup(race?: { size: SizeType }) {
  const { user, session } = await createTestUser();
  const ruleset = await createSeededTestRuleset(user.id);
  const raceId =
    race &&
    (await Races.create(db, { name: `Test Race ${uniqueId()}`, rulesetId: ruleset.id, baseSpeed: 30, ...race }))[0].id;
  RulesetViews.invalidate(ruleset.id);
  const character = await createCharacterAs(
    session,
    raceId ? { rulesetId: ruleset.id, raceId } : { rulesetId: ruleset.id },
  );
  const newItem = (values?: Partial<InferInsertModel<typeof itemsInRules>>, properties?: Record<string, string>) =>
    createTestItem({ rulesetId: ruleset.id, ...ITEM_VALUES, ...values }, properties);
  return { session, character, newItem, item: await newItem() };
}

async function update(
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
) {
  return CharacterInventoryService.updateItem(
    session,
    characterId,
    await entryOf(characterId, itemId),
    quantity,
    equipped,
    location,
    charges[0],
    charges[1],
    weaponSet,
    force,
    updatedAt,
  );
}

describe("InventoryService", () => {
  test("lists what the character carries with each item's customizations, removed items gone, archived characters included", async () => {
    const { session, character, item, newItem } = await setup();
    expect(await CharacterInventoryService.getInventory(session, character.id)).toEqual([]);
    await Properties.create(db, {
      entityId: item.id,
      entityType: "items",
      type: WEAPON_PROFICIENCY,
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
    RulesetViews.invalidate(character.rulesetId);
    const removed = await newItem();
    await add(session, character.id, item.id, { quantity: 3 });
    await add(session, character.id, removed.id);
    expect(await remove(session, character.id, removed.id)).toEqual({ success: true });

    const expected = [
      {
        itemId: item.id,
        quantity: 3,
        equipped: false,
        item: {
          name: item.name,
          properties: [{ type: WEAPON_PROFICIENCY }],
          modifiers: [{ target: "combat.bab" }],
          requirements: [{ target: "abilities.strength.misc" }],
        },
      },
    ];
    expect(await CharacterInventoryService.getInventory(session, character.id)).toMatchObject(expected);
    await CharactersService.archiveCharacter(session, character.id);
    expect(await CharacterInventoryService.getInventory(session, character.id)).toMatchObject(expected);
  });

  test("lists each entry with where its item can go and where it's worn", async () => {
    const { session, character, item, newItem } = await setup();
    const sword = await newItem({ type: "Weapon" });
    await add(session, character.id, sword.id, equipped("Main Hand", 0));
    await add(session, character.id, item.id);

    const inventory = await CharacterInventoryService.getInventory(session, character.id);
    expect(inventory.find((entry) => entry.itemId === sword.id)).toMatchObject({
      slotLabel: "Main Hand (Set 1)",
      placement: { charges: null, hand: true, slot: null },
    });
    expect(inventory.find((entry) => entry.itemId === item.id)).toMatchObject({
      slotLabel: null,
      placement: { hand: false, slot: "Other", locations: [{ location: "Other", weaponSet: false }] },
    });
  });

  describe("a slot's warning", () => {
    test("names what takes the slot, with the weapon set from 1, as the save refuses it", async () => {
      const { warning } = await placed();
      expect(await warning("Head", 0)).toBe("Head slot is occupied by Helm");
      expect(await warning("Finger", 0)).toBe("Both finger slots are occupied");
      expect(await warning("Two Handed", 0)).toBe("Cannot equip two-handed: Longsword is in Main Hand (Set 1)");
      expect(await warning("Off Hand", 1)).toBe("Cannot equip: Greatsword is two-handed in Set 2");
      expect(await warning("Main Hand", 0)).toBe("Main Hand is occupied by Longsword (Set 1)");
    });

    test("is none for a free slot, another weapon set, or the entry being edited", async () => {
      const { character, items, warning } = await placed();
      expect(await warning("Neck", 0)).toBeNull();
      expect(await warning("Off Hand", 0)).toBeNull();
      expect(await warning("Main Hand", 2)).toBeNull();
      expect(await warning("Head", 0, await entryOf(character.id, items.helm.id))).toBeNull();
    });
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
      ] as [number | null, number | null][])
        expect(add(session, character.id, item.id, { charges })).rejects.toMatchObject({ refusal: "invalid" });

      await add(session, character.id, item.id, { charges: [10, 10] });
      expect(update(session, character.id, item.id, { charges: [10, 20] })).rejects.toMatchObject({
        refusal: "invalid",
      });
    });

    test("refuses a missing item and changes to an entry the character doesn't have", async () => {
      const { session, character } = await setup();
      expect(add(session, character.id, NIL_UUID)).rejects.toMatchObject({
        message: `Item ${NIL_UUID} does not belong to the character's ruleset`,
        refusal: "invalid",
      });
      expect(update(session, character.id, NIL_UUID)).rejects.toThrow(NotFoundError);
      expect(remove(session, character.id, NIL_UUID)).rejects.toThrow(NotFoundError);
    });

    test("refuses a missing character, another user's, and changes to an archived one", async () => {
      const { session, character, item, newItem } = await setup();
      const { session: other } = await createTestUser();
      await add(session, character.id, item.id);
      const calls = (s: Session, characterId: string) => [
        () => CharacterInventoryService.getInventory(s, characterId),
        () => add(s, characterId, item.id),
        () => update(s, characterId, item.id),
        () => remove(s, characterId, item.id),
      ];
      // One at a time: the test's transaction has a single connection.
      for (const call of [...calls(session, NIL_UUID), ...calls(other, character.id)])
        expect(call()).rejects.toThrow(NotFoundError);

      await CharactersService.archiveCharacter(session, character.id);
      expect(add(session, character.id, (await newItem()).id)).rejects.toThrow(NotFoundError);
      expect(update(session, character.id, item.id, { quantity: 2 })).rejects.toThrow(NotFoundError);
    });

    test("refuses an edit started from a stale copy", async () => {
      const { session, character, item } = await setup();
      const added = await add(session, character.id, item.id);
      await update(session, character.id, item.id, { quantity: 2 }, added.updatedAt);
      expect(update(session, character.id, item.id, { quantity: 3 }, added.updatedAt)).rejects.toThrow(ConflictError);
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
      const inherited = await createTestItem({ rulesetId: grandparent.id, ...ITEM_VALUES });
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
        const character = await createCharacterAs(session, { rulesetId: ruleset.id, raceId: race.id });
        expect(await add(session, character.id, inherited.id)).toMatchObject({ itemId: inherited.id });
      }

      // A character of the seeded ruleset: the item's ruleset is unrelated to it.
      const onSeed = await createCharacterAs(session);
      expect(add(session, onSeed.id, inherited.id)).rejects.toMatchObject({
        message: `Item ${inherited.id} does not belong to the character's ruleset`,
        refusal: "invalid",
      });
    });

    test("adds an item by the id of what its fork copied as the copy, placed as the copy is, and not one it deleted", async () => {
      const session = makeSession();
      const plain = await findPlainItem((await getSeedCtx()).rulesetId);
      // The fork makes the item a weapon: a hand holds it, the torso no longer does
      const fork = await createSeededTestRuleset(SEED_USER_ID);
      const copy = await ItemsService.updateItem(session, fork.id, plain.id, { name: plain.name, type: "Weapon" });
      const character = await createCharacterAs(session, { rulesetId: fork.id });
      expect(add(session, character.id, plain.id, equipped("Torso"))).rejects.toThrow(
        "Weapons can only be equipped in hand slots",
      );
      expect(await add(session, character.id, plain.id, equipped("Main Hand", 0))).toMatchObject({ itemId: copy.id });

      // A fork that deleted it shows none of it: its entry would be listed nowhere
      const deleting = await createSeededTestRuleset(SEED_USER_ID);
      await ItemsService.deleteItem(session, deleting.id, plain.id);
      const onDeleting = await createCharacterAs(session, { rulesetId: deleting.id });
      expect(add(session, onDeleting.id, plain.id)).rejects.toMatchObject({
        message: `Item ${plain.id} does not belong to the character's ruleset`,
        refusal: "invalid",
      });
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
      expect(add(session, character.id, weapon.id, equipped("Trinket"))).rejects.toThrow(
        "Weapons can only be equipped in hand slots",
      );
      expect(add(session, character.id, armor.id, equipped("Head"))).rejects.toThrow(
        "Body armor can only be equipped in the Torso slot",
      );
      expect(add(session, character.id, shield.id, equipped("Head"))).rejects.toThrow(
        "Shields can only be equipped in the Off Hand slot",
      );
      // A hand holds weapons and shields only, and a shield only the off hand
      expect(add(session, character.id, armor.id, equipped("Main Hand", 0))).rejects.toThrow(
        "Body armor can only be equipped in the Torso slot",
      );
      expect(add(session, character.id, shield.id, equipped("Main Hand", 0))).rejects.toThrow(
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
      expect(add(session, character.id, item.id, equipped("Main Hand"))).rejects.toThrow(message);
      expect(add(session, character.id, shield.id, equipped("Off Hand"))).rejects.toThrow(message);
      await add(session, character.id, item.id);
      expect(update(session, character.id, item.id, equipped("Main Hand"))).rejects.toThrow(message);
    });

    test("fills each slot once per weapon set, a two-handed weapon taking both hands, and two rings", async () => {
      const { session, character, newItem } = await setup();
      const items = [];
      for (let i = 0; i < 9; i++) items.push((await newItem()).id);
      const [helm, otherHelm, sword, greatsword, otherGreatsword, dagger, ...rings] = items;
      const equip = (itemId: string, placement: Placement) => add(session, character.id, itemId, placement);

      await equip(helm, equipped("Head"));
      expect(equip(otherHelm, equipped("Head"))).rejects.toMatchObject({ refusal: "invalid" });

      await equip(sword, equipped("Main Hand", 0));
      expect(equip(greatsword, equipped("Two Handed", 0))).rejects.toMatchObject({ refusal: "invalid" });
      expect(await equip(greatsword, equipped("Two Handed", 1))).toMatchObject({
        location: "Two Handed",
        weaponSet: 1,
      });
      expect(equip(otherGreatsword, equipped("Two Handed", 1))).rejects.toThrow(
        /^Two Handed is occupied by Test Item .* \(Set 2\)$/,
      );
      expect(equip(dagger, equipped("Main Hand", 1))).rejects.toMatchObject({ refusal: "invalid" });
      expect(await equip(otherGreatsword, equipped("Two Handed", 2))).toMatchObject({ weaponSet: 2 });
      // A weapon doesn't block its own slot.
      expect(
        await update(session, character.id, greatsword, { ...equipped("Two Handed", 1), quantity: 2 }),
      ).toMatchObject({ quantity: 2 });

      await equip(dagger, equipped("Off Hand", 0));
      const [first, second, third] = rings;
      await equip(first, equipped("Finger"));
      await equip(second, equipped("Finger"));
      expect(equip(third, equipped("Finger"))).rejects.toMatchObject({ refusal: "invalid" });
      expect(update(session, character.id, dagger, equipped("Off Hand", 0))).resolves.toMatchObject({
        location: "Off Hand",
      });
    });

    // A weapon is sized for its wielder: the table's Large (two-handed) needs both hands whatever the character's size.
    test.each([
      ["Medium", "Medium", "Main Hand", "allowed"],
      ["Large", "Medium", "Off Hand", "allowed"],
      ["Medium", "Large", "Two Handed", "allowed"],
      ["Medium", "Large", "Main Hand", "This weapon requires two hands"],
      ["Medium", "Large", "Off Hand", "This weapon requires two hands"],
      ["Small", "Medium", "Main Hand", "allowed"],
      ["Small", "Large", "Two Handed", "allowed"],
      ["Large", "Large", "Off Hand", "This weapon requires two hands"],
      ["Medium", "unsized", "Main Hand", "allowed"],
    ] as const)(
      "lets a %s character wield a weapon the table makes %s in the %s: %s",
      async (characterSize, weaponSize, slot, outcome) => {
        const { session, character, newItem } = await setup({ size: characterSize });
        const weapon = await newItem(
          {},
          weaponSize === "unsized" ? {} : { [WEAPON_PROFICIENCY]: "Martial", [WEAPON_SIZE]: weaponSize },
        );

        const attempt = add(session, character.id, weapon.id, equipped(slot, 0));
        if (outcome === "allowed") expect(await attempt).toMatchObject({ equipped: true, location: slot });
        else expect(attempt).rejects.toThrow(outcome);
      },
    );

    test("needs both hands for a bow, whatever its size", async () => {
      const { session, character } = await setup();
      const shortbow = (await getSeedCtx()).itemMap["Shortbow"];
      expect(add(session, character.id, shortbow, equipped("Main Hand", 0))).rejects.toThrow(
        "This weapon requires two hands",
      );
      // Forced past the martial proficiency the character lacks.
      expect(await add(session, character.id, shortbow, { ...equipped("Two Handed", 0), force: true })).toMatchObject({
        location: "Two Handed",
      });
    });

    test("lets a character proficient with light armor wear elven chain and celestial armor, light armor, not chain mail", async () => {
      // An elf rogue, proficient with light armor only, out of her studded leather
      const lyra = await findSeededCharacter("Lyra Shadowstep");
      const session = makeSession();
      const { itemMap } = await getSeedCtx();
      await remove(session, lyra.id, itemMap["Studded Leather"]);
      expect(add(session, lyra.id, itemMap["Chain Mail"], equipped("Torso"))).rejects.toThrow(
        "Character does not meet the requirements to equip this item",
      );
      for (const armor of ["Elven Chain", "Celestial Armor"]) {
        expect(await add(session, lyra.id, itemMap[armor], equipped("Torso"))).toMatchObject({ location: "Torso" });
        await remove(session, lyra.id, itemMap[armor]);
      }
    });

    test("holds the same weapon twice, a dagger in each hand, as two entries; not twice in one hand", async () => {
      const { session, character } = await setup();
      const dagger = (await getSeedCtx()).itemMap["Dagger"];
      const first = await add(session, character.id, dagger, equipped("Main Hand", 0));
      const second = await add(session, character.id, dagger, equipped("Off Hand", 0));
      expect(second.id).not.toBe(first.id);
      // The other dagger takes the main hand: the second can't go there, but moving the first within its hand is fine
      expect(
        CharacterInventoryService.updateItem(session, character.id, second.id, 1, true, "Main Hand", null, null, 0),
      ).rejects.toThrow("Main Hand is occupied by Dagger (Set 1)");
      expect(
        await CharacterInventoryService.updateItem(
          session,
          character.id,
          first.id,
          2,
          true,
          "Main Hand",
          null,
          null,
          0,
        ),
      ).toMatchObject({ id: first.id, quantity: 2 });
      expect(await CharacterInventoryService.removeItem(session, character.id, first.id)).toEqual({ success: true });
      expect((await CharacterInventoryService.getInventory(session, character.id)).map((entry) => entry.id)).toEqual([
        second.id,
      ]);
    });

    test("refuses a bastard sword in one hand without its proficiency, unless forced, and a dwarf's waraxe in one hand", async () => {
      const session = makeSession();
      const { itemMap } = await getSeedCtx();
      // A human fighter, proficient with martial weapons but no exotic one: the sword in two hands only
      const bjorn = await findSeededCharacter("Bjorn Ironhand");
      const sword = itemMap["Bastard Sword"];
      // Refused with an issue, which the form shows and can force
      const refusal = await add(session, bjorn.id, sword, equipped("Main Hand", 1)).catch((error: unknown) => error);
      expect(refusal).toMatchObject({
        refusal: "invalid",
        issues: [{ category: "requirements", entityName: "Bastard Sword", entityType: "items" }],
      });
      expect(await add(session, bjorn.id, sword, equipped("Two Handed", 1))).toMatchObject({ location: "Two Handed" });
      await remove(session, bjorn.id, sword);
      expect(await add(session, bjorn.id, sword, { ...equipped("Main Hand", 1), force: true })).toMatchObject({
        location: "Main Hand",
      });
      // A dwarf fighter treats the waraxe as a martial weapon, in one hand too
      const kael = await findSeededCharacter("Kael Stormborn");
      expect(await add(session, kael.id, itemMap["Dwarven Waraxe"], equipped("Main Hand", 1))).toMatchObject({
        location: "Main Hand",
      });
    });

    test("checks a variant's own requirements beside its template's, each starting at level 1", async () => {
      const { session, character, newItem } = await setup();
      const template = await newItem({ type: "Armor", isTemplate: true });
      const variant = await newItem({ type: "Armor", sourceItemId: template.id });
      const strengthAtLeast = (entityId: string, value: string) =>
        Requirements.create(db, {
          entityId,
          entityType: "items",
          level: "1",
          target: "abilities.strength.misc",
          value,
          valueType: "number",
          operator: "greater_than_or_equal",
        });
      // The template's met, the variant's own unmet: the variant can't be worn
      await strengthAtLeast(template.id, "0");
      await strengthAtLeast(variant.id, "30");
      RulesetViews.invalidate(character.rulesetId);

      expect(add(session, character.id, variant.id, equipped("Torso"))).rejects.toMatchObject({
        refusal: "invalid",
      });
    });

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
      RulesetViews.invalidate(character.rulesetId);

      expect(add(session, character.id, armor.id, equipped("Torso"))).rejects.toMatchObject({
        refusal: "invalid",
      });
      expect(await add(session, character.id, armor.id, { ...equipped("Torso"), force: true })).toMatchObject({
        equipped: true,
        location: "Torso",
      });
    });
  });
});
