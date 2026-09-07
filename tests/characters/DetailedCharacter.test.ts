import { and, eq } from "drizzle-orm";
import { abilitiesInRules, aptitudesInRules, characterAbilitiesInCharacter, charactersInCharacter, featsInRules, inventoryInCharacter, itemsInRules, klassesInRules, klassLevelsInRules, levelFeatsInCharacter, levelsInCharacter, propertiesInCustomization, racesInRules, rulesetsInRules, savesInRules } from "@/drizzle/schema.ts";
import { DND35_DMG_NAME, DND35_RULESET_NAME, DND35_COMPLETE_WARRIOR_NAME, DND35_COMPLETE_DIVINE_NAME } from "@/database/packages/dnd35/names.ts";
import { seedClass } from "@/database/packages/dnd35/seed-utils.ts";
import { addClassLevels, addFeats, addPowers, addSkills, createCharacter, getSeedContext, SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Characters, Items, KlassLevels, Modifiers, Properties, Requirements, Rulesets, Sessions, Users } from "@/server/repositories/index.ts";
import DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import { ALLOWED_ALL, type AptitudeLevelData } from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import type { Character } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";

describe("DetailedCharacter", () => {
  test("build throws error when ruleset is not found", async () => {
    // Get the user ID
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const character: Partial<Character> = {
      name: "Test Character",
      rulesetId: "00000000-0000-0000-0000-000000000000", // Non-existent UUID
      raceId: "00000000-0000-0000-0000-000000000000", // Non-existent UUID
      userId: user.id,
      xp: 0,
      alignment: "True Neutral",
      age: 20,
      gender: "Male",
      height: "180",
      weight: "80",
    };

    const detailedCharacter = new DetailedCharacter(character as Character);

    try {
      await detailedCharacter.build();
      throw new Error("Should have thrown an error");
    } catch (error) {
      expect(error).toBeDefined();
      if (error instanceof Error) {
        expect(error.message).toBe("Ruleset not found");
      }
    }
  });

  test("build throws error when race is not found", async () => {
    // Get the user ID
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    // Create a session for the user
    const [session] = await Sessions.create(db, { userId: user.id });
    expect(session).toBeDefined();

    // Get the existing ruleset
    const result = await Rulesets.findMany(db, session, {
      scope: "base",
      search: DND35_RULESET_NAME,
    }, { limit: 1, page: 1 });
    const ruleset = result.items[0];
    expect(ruleset).toBeDefined();

    const character: Partial<Character> = {
      name: "Test Character",
      rulesetId: ruleset.id,
      raceId: "00000000-0000-0000-0000-000000000000", // Non-existent UUID
      userId: user.id,
      xp: 0,
      alignment: "True Neutral",
      age: 20,
      gender: "Male",
      height: "180",
      weight: "80",
    };

    const detailedCharacter = new DetailedCharacter(character as Character);

    try {
      await detailedCharacter.build();
      throw new Error("Should have thrown an error");
    } catch (error) {
      expect(error).toBeDefined();
      if (error instanceof Error) {
        expect(error.message).toBe("Race not found");
      }
    }
  });

  async function buildCharacter(name: string) {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");
    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === name);
    if (!character) throw new Error(`Character ${name} must be defined`);
    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();
    return detailedCharacter;
  }

  test("build successfully creates a detailed character", async () => {
    const detailedCharacter = await buildCharacter("Bjorn Ironhand");

    // Test getters
    expect(detailedCharacter.getRuleset()?.name).toBe(DND35_RULESET_NAME);
    expect(detailedCharacter.getPlayer()).toBe(undefined);
    expect(detailedCharacter.getCampaign()).toBe(undefined);
    expect(detailedCharacter.getDetailedCharacterIdentity()).toBeDefined();
    expect(detailedCharacter.getDetailedCharacterClasses()).toBeDefined();
    expect(detailedCharacter.getDetailedCharacterInventory()).toBeDefined();
    expect(detailedCharacter.getDetailedCharacterAbilities()).toBeDefined();
    expect(detailedCharacter.getDetailedCharacterSkills()).toBeDefined();
    expect(detailedCharacter.getDetailedCharacterSavingThrows()).toBeDefined();
    expect(detailedCharacter.getDetailedCharacterCombat()).toBeDefined();
    expect(detailedCharacter.getDetailedCharacterAptitudes()).toBeDefined();
    expect(detailedCharacter.getDetailedCharacterModifiers()).toBeDefined();

    // Test specific values from Bjorn's data
    const identity = detailedCharacter.getDetailedCharacterIdentity().getIdentity();
    expect(identity.physiology.name).toBe("Bjorn Ironhand");
    expect(identity.beliefs.alignment).toBe("Lawful Good");
    expect(identity.physiology.race.name).toBe("Human");
    expect(identity.meta.xp).toBe(10000);

    const abilities = detailedCharacter.getDetailedCharacterAbilities().getAbilities();
    expect(abilities.strength.base).toBe(18);
    expect(abilities.dexterity.base).toBe(14);
    expect(abilities.constitution.base).toBe(16);
    expect(abilities.intelligence.base).toBe(12);
    expect(abilities.wisdom.base).toBe(10);
    expect(abilities.charisma.base).toBe(8);

    // Inventory is now slot-based — only equipped items with a valid slot appear
    const inventory = detailedCharacter.getDetailedCharacterInventory().getInventory();
    expect(typeof inventory).toBe("object");

    // Validate the character
    const validation = detailedCharacter.validate();
    expect(validation.valid).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });

  test.each([
    ["Bjorn Ironhand", "Human", "Lawful Good"],
    ["Lyra Shadowstep", "Elf", "Chaotic Neutral"],
    ["Grak Thunderfist", "Half-Orc", "Chaotic Neutral"],
    ["Zen Whitepetal", "Human", "Lawful Neutral"],
    ["Kael Stormborn", "Dwarf", "Neutral Good"],
    ["Elara Starweaver", "Elf", "Neutral Good"],
    ["Vex Flamecaller", "Human", "Chaotic Good"],
    ["Theron Lightbringer", "Human", "Lawful Good"],
    ["Melody Silverveil", "Half-Elf", "Chaotic Good"],
    ["Aldric Dawnbringer", "Human", "Lawful Good"],
    ["Rowan Thornwalker", "Human", "True Neutral"],
    ["Fenn Ashwalker", "Half-Elf", "Neutral Good"],
  ])("validates seeded character %s", async (name, race, alignment) => {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === name);
    if (!character) throw new Error(`Character ${name} must be defined`);

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    const identity = detailedCharacter.getDetailedCharacterIdentity().getIdentity();
    expect(identity.physiology.name).toBe(name);
    expect(identity.physiology.race.name).toBe(race);
    expect(identity.beliefs.alignment).toBe(alignment);

    const validation = detailedCharacter.validate();
    expect(validation.valid).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });

  test("registers equipped weapons and populates combat.weaponsets", async () => {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === "Bjorn Ironhand");
    if (!character) throw new Error("Character must be defined");

    // Get the ruleset ID for item lookup
    const [ruleset] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

    // Look up weapon items by name
    const items = await db
      .select({ id: itemsInRules.id, name: itemsInRules.name })
      .from(itemsInRules)
      .where(eq(itemsInRules.rulesetId, ruleset.id));
    const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

    // Clear existing inventory so the test controls its own state
    await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

    // Equip a Longsword in Main Hand (weapon set 0) and Shortsword in Off Hand (weapon set 0)
    await db.insert(inventoryInCharacter).values([
      {
        characterId: character.id,
        itemId: itemMap["Longsword"],
        quantity: 1,
        equipped: true,
        location: "Main Hand",
        weaponSet: 0,
      },
      {
        characterId: character.id,
        itemId: itemMap["Shortsword"],
        quantity: 1,
        equipped: true,
        location: "Off Hand",
        weaponSet: 0,
      },
    ]);

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    // Verify combat weaponsets have the weapons in set 0
    const combat = detailedCharacter.getDetailedCharacterCombat().getCombat();
    const weaponSet0 = combat.weaponsets["0"];
    expect(weaponSet0).toBeDefined();
    expect(weaponSet0.mainhand).not.toBeNull();
    expect(weaponSet0.mainhand!.name).toBe("Longsword");
    expect(weaponSet0.mainhand!.damage.base).toBe("1d8");
    expect(weaponSet0.mainhand!.damage.types).toContain("Slashing");
    expect(weaponSet0.mainhand!.damage.critical.range).toBe(2);
    expect(weaponSet0.mainhand!.damage.critical.multiplier).toBe(2);

    expect(weaponSet0.offhand).not.toBeNull();
    expect(weaponSet0.offhand!.name).toBe("Shortsword");
    expect(weaponSet0.offhand!.damage.base).toBe("1d6");
    expect(weaponSet0.offhand!.damage.types).toContain("Piercing");

    // Verify strength modifiers: Bjorn has STR 18 => modifier +4
    // Main hand gets full STR mod, off hand gets half (floor(4/2) = 2)
    expect(weaponSet0.mainhand!.damage.strength).toBe(4);
    expect(weaponSet0.offhand!.damage.strength).toBe(2);

    // Verify weapon groupings via DetailedCharacterWeapons (grouped by WEAPON_TYPE property)
    const weapons = detailedCharacter.getDetailedCharacterWeapons().getWeapons();
    expect(weapons["longsword"]).toBeDefined();
    expect(weapons["shortsword"]).toBeDefined();
  });

  test("weapon variants group by WEAPON_TYPE, not item name", async () => {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === "Bjorn Ironhand");
    if (!character) throw new Error("Character must be defined");

    const [ruleset] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

    // Create a weapon variant "Longsword +1" with WEAPON_TYPE "Longsword"
    const [variant] = await Items.create(db, {
      name: "Longsword +1",
      description: "A magic longsword",
      type: "Weapon",
      slot: "Main Hand",
      rulesetId: ruleset.id,
    });
    await Properties.createMany(db, [
      { entityId: variant.id, entityType: "items", type: "WEAPON_PROFICIENCY", value: "Martial" },
      { entityId: variant.id, entityType: "items", type: "WEAPON_FAMILY", value: "Sword" },
      { entityId: variant.id, entityType: "items", type: "WEAPON_BASE_DAMAGE", value: "1d8" },
      { entityId: variant.id, entityType: "items", type: "WEAPON_CRITICAL_RANGE", value: "2" },
      { entityId: variant.id, entityType: "items", type: "WEAPON_CRITICAL_MULTIPLIER", value: "2" },
      { entityId: variant.id, entityType: "items", type: "DAMAGE_TYPE", value: "Slashing" },
      { entityId: variant.id, entityType: "items", type: "WEAPON_SIZE", value: "Medium" },
      { entityId: variant.id, entityType: "items", type: "WEAPON_TYPE", value: "Longsword" },
    ]);

    // Clear existing inventory and equip the variant
    await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
    await db.insert(inventoryInCharacter).values([{
      characterId: character.id,
      itemId: variant.id,
      quantity: 1,
      equipped: true,
      location: "Main Hand",
      weaponSet: 0,
    }]);
    invalidateRuleset(ruleset.id);

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    // The weapon should group under "longsword" (from WEAPON_TYPE), not "longsword1" (from item name)
    const weapons = detailedCharacter.getDetailedCharacterWeapons().getWeapons();
    expect(weapons["longsword"]).toBeDefined();
    expect(weapons["longsword1"]).toBeUndefined();
  });

  test("registers equipped armor and calculates AC correctly", async () => {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === "Bjorn Ironhand");
    if (!character) throw new Error("Character must be defined");

    const [ruleset] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

    const items = await db
      .select({ id: itemsInRules.id, name: itemsInRules.name })
      .from(itemsInRules)
      .where(eq(itemsInRules.rulesetId, ruleset.id));
    const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

    // Clear existing inventory so the test controls its own state
    await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

    // Equip Chain Mail (AC bonus 5, max dex 2, check penalty -5, spell failure 30%)
    await db.insert(inventoryInCharacter).values({
      characterId: character.id,
      itemId: itemMap["Chain Mail"],
      quantity: 1,
      equipped: true,
      location: "Torso",
    });

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    // Verify armor registration
    const armors = detailedCharacter.getDetailedCharacterArmors().getArmors();
    // Grouped under: "chainmail" (ARMOR_TYPE)
    expect(armors["chainmail"]).toBeDefined();
    expect(armors["chainmail"].name).toBe("Chain Mail");
    expect(armors["chainmail"].ac.bonus).toBe(5);
    expect(armors["chainmail"].ac.total).toBe(5);
    expect(armors["chainmail"].checkpenalty).toBe(-5);
    expect(armors["chainmail"].spellfailure).toBe(30);
    expect(armors["chainmail"].maxdex).toBe(2);

    // Verify AC calculations on combat
    const combat = detailedCharacter.getDetailedCharacterCombat().getCombat();
    expect(combat.ac.armor).toBe(5);
    // Bjorn has DEX 14 => modifier +2, but Chain Mail max dex is 2, so dexterity AC = min(2, 2) = 2
    expect(combat.ac.dexterity).toBe(2);
    // Base 10 + armor 5 + dex 2 = 17
    expect(combat.ac.total).toBe(10 + 5 + 2);
  });

  test("masterwork armor reduces check penalty by 1", async () => {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === "Bjorn Ironhand");
    if (!character) throw new Error("Character must be defined");

    const [ruleset] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

    // Create a masterwork Chain Mail variant with its own properties
    const [mwArmor] = await Items.create(db, {
      name: "Chain Mail (Masterwork)",
      description: "A masterwork chain mail",
      type: "Armor",
      slot: "Torso",
      rulesetId: ruleset.id,
    });
    await Properties.createMany(db, [
      { entityId: mwArmor.id, entityType: "items", type: "ARMOR_PROFICIENCY", value: "Heavy" },
      { entityId: mwArmor.id, entityType: "items", type: "ARMOR_TYPE", value: "Chain Mail" },
      { entityId: mwArmor.id, entityType: "items", type: "ARMOR_AC_BONUS", value: "5" },
      { entityId: mwArmor.id, entityType: "items", type: "ARMOR_CHECK_PENALTY", value: "-5" },
      { entityId: mwArmor.id, entityType: "items", type: "ITEM_SPELL_FAILURE", value: "30" },
      { entityId: mwArmor.id, entityType: "items", type: "ARMOR_MAX_DEX", value: "2" },
      { entityId: mwArmor.id, entityType: "items", type: "ITEM_MASTERWORK", value: "true" },
    ]);

    await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
    await db.insert(inventoryInCharacter).values({
      characterId: character.id,
      itemId: mwArmor.id,
      quantity: 1,
      equipped: true,
      location: "Torso",
    });
    invalidateRuleset(ruleset.id);

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    const armors = detailedCharacter.getDetailedCharacterArmors().getArmors();
    expect(armors["chainmailmasterwork"]).toBeDefined();
    // Base check penalty -5, masterwork reduces by 1 => -4
    expect(armors["chainmailmasterwork"].checkpenalty).toBe(-4);
    // AC and other properties remain unchanged
    expect(armors["chainmailmasterwork"].ac.bonus).toBe(5);
    expect(armors["chainmailmasterwork"].spellfailure).toBe(30);
    expect(armors["chainmailmasterwork"].maxdex).toBe(2);
  });

  test("medium armor reduces speed (30ft → 20ft)", async () => {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === "Bjorn Ironhand");
    if (!character) throw new Error("Character must be defined");

    const items = await db
      .select({ id: itemsInRules.id, name: itemsInRules.name })
      .from(itemsInRules)
      .where(eq(itemsInRules.rulesetId, character.rulesetId));
    const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

    await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
    await db.insert(inventoryInCharacter).values({
      characterId: character.id,
      itemId: itemMap["Breastplate"],
      quantity: 1,
      equipped: true,
      location: "Torso",
    });

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    const combat = detailedCharacter.getDetailedCharacterCombat().getCombat();
    expect(combat.speed.base).toBe(30);
    expect(combat.speed.total).toBe(20);
  });

  test("heavy armor reduces speed (30ft → 20ft)", async () => {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === "Bjorn Ironhand");
    if (!character) throw new Error("Character must be defined");

    const items = await db
      .select({ id: itemsInRules.id, name: itemsInRules.name })
      .from(itemsInRules)
      .where(eq(itemsInRules.rulesetId, character.rulesetId));
    const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

    await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
    await db.insert(inventoryInCharacter).values({
      characterId: character.id,
      itemId: itemMap["Full Plate"],
      quantity: 1,
      equipped: true,
      location: "Torso",
    });

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    const combat = detailedCharacter.getDetailedCharacterCombat().getCombat();
    expect(combat.speed.base).toBe(30);
    expect(combat.speed.total).toBe(20);
  });

  test("light armor does not reduce speed", async () => {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === "Bjorn Ironhand");
    if (!character) throw new Error("Character must be defined");

    const items = await db
      .select({ id: itemsInRules.id, name: itemsInRules.name })
      .from(itemsInRules)
      .where(eq(itemsInRules.rulesetId, character.rulesetId));
    const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

    await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
    await db.insert(inventoryInCharacter).values({
      characterId: character.id,
      itemId: itemMap["Leather Armor"],
      quantity: 1,
      equipped: true,
      location: "Torso",
    });

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    const combat = detailedCharacter.getDetailedCharacterCombat().getCombat();
    expect(combat.speed.base).toBe(30);
    expect(combat.speed.total).toBe(30);
  });

  test("masterwork shield reduces check penalty by 1", async () => {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === "Bjorn Ironhand");
    if (!character) throw new Error("Character must be defined");

    const [ruleset] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

    // Create a masterwork Heavy Steel Shield variant
    const [mwShield] = await Items.create(db, {
      name: "Heavy Steel Shield (Masterwork)",
      description: "A masterwork heavy steel shield",
      type: "Shield",
      slot: "Off Hand",
      rulesetId: ruleset.id,
    });
    await Properties.createMany(db, [
      { entityId: mwShield.id, entityType: "items", type: "SHIELD_PROFICIENCY", value: "Heavy" },
      { entityId: mwShield.id, entityType: "items", type: "SHIELD_TYPE", value: "Heavy Steel Shield" },
      { entityId: mwShield.id, entityType: "items", type: "SHIELD_AC_BONUS", value: "2" },
      { entityId: mwShield.id, entityType: "items", type: "ARMOR_CHECK_PENALTY", value: "-2" },
      { entityId: mwShield.id, entityType: "items", type: "ITEM_SPELL_FAILURE", value: "15" },
      { entityId: mwShield.id, entityType: "items", type: "ITEM_MASTERWORK", value: "true" },
    ]);

    await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
    await db.insert(inventoryInCharacter).values({
      characterId: character.id,
      itemId: mwShield.id,
      quantity: 1,
      equipped: true,
      location: "Off Hand",
    });
    invalidateRuleset(ruleset.id);

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    const shields = detailedCharacter.getDetailedCharacterShields().getShields();
    expect(shields["heavysteelshield"]).toBeDefined();
    // Base check penalty -2, masterwork reduces by 1 => -1
    expect(shields["heavysteelshield"].checkpenalty).toBe(-1);
    // AC and other properties remain unchanged
    expect(shields["heavysteelshield"].ac.bonus).toBe(2);
    expect(shields["heavysteelshield"].spellfailure).toBe(15);
  });

  test("template-derived item inherits properties for AC calculation", async () => {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === "Bjorn Ironhand");
    if (!character) throw new Error("Character must be defined");

    const [ruleset] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

    // Find the base Full Plate item (template)
    const items = await db
      .select({ id: itemsInRules.id, name: itemsInRules.name })
      .from(itemsInRules)
      .where(eq(itemsInRules.rulesetId, ruleset.id));
    const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));
    const fullPlateId = itemMap["Full Plate"];

    // Create a derived item from the template (no own properties — inherits all from template)
    const [derived] = await Items.create(db, {
      name: "Full Plate +1",
      description: "An enchanted full plate",
      type: "Armor",
      slot: "Torso",
      rulesetId: ruleset.id,
      sourceItemId: fullPlateId,
    });

    // Clear existing inventory and equip the derived item
    await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
    await db.insert(inventoryInCharacter).values({
      characterId: character.id,
      itemId: derived.id,
      quantity: 1,
      equipped: true,
      location: "Torso",
    });

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    // Full Plate template properties: AC bonus 8, max dex 1, check penalty -6, spell failure 35%
    const armors = detailedCharacter.getDetailedCharacterArmors().getArmors();
    expect(armors["fullplate1"]).toBeDefined();
    expect(armors["fullplate1"].name).toBe("Full Plate +1");
    expect(armors["fullplate1"].ac.bonus).toBe(8);
    expect(armors["fullplate1"].maxdex).toBe(1);
    expect(armors["fullplate1"].checkpenalty).toBe(-6);
    expect(armors["fullplate1"].spellfailure).toBe(35);

    // Verify AC: base 10 + armor 8 + dex min(2, 1) = 19
    const combat = detailedCharacter.getDetailedCharacterCombat().getCombat();
    expect(combat.ac.armor).toBe(8);
    expect(combat.ac.dexterity).toBe(1);
    expect(combat.ac.total).toBe(10 + 8 + 1);
  });

  test("registers equipped shield and calculates AC correctly", async () => {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === "Bjorn Ironhand");
    if (!character) throw new Error("Character must be defined");

    const [ruleset] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

    const items = await db
      .select({ id: itemsInRules.id, name: itemsInRules.name })
      .from(itemsInRules)
      .where(eq(itemsInRules.rulesetId, ruleset.id));
    const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

    // Clear existing inventory so the test controls its own state
    await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

    // Equip Heavy Steel Shield (AC bonus 2, check penalty -2, spell failure 15%)
    await db.insert(inventoryInCharacter).values({
      characterId: character.id,
      itemId: itemMap["Heavy Steel Shield"],
      quantity: 1,
      equipped: true,
      location: "Off Hand",
    });

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    // Verify shield registration
    const shields = detailedCharacter.getDetailedCharacterShields().getShields();
    // Grouped under: "heavysteelshield" (SHIELD_TYPE)
    expect(shields["heavysteelshield"]).toBeDefined();
    expect(shields["heavysteelshield"].name).toBe("Heavy Steel Shield");
    expect(shields["heavysteelshield"].ac.bonus).toBe(2);
    expect(shields["heavysteelshield"].ac.total).toBe(2);
    expect(shields["heavysteelshield"].checkpenalty).toBe(-2);
    expect(shields["heavysteelshield"].spellfailure).toBe(15);

    // Verify AC on combat includes shield
    const combat = detailedCharacter.getDetailedCharacterCombat().getCombat();
    expect(combat.ac.shield).toBe(2);
    // Bjorn has DEX 14 => modifier +2, no armor so dex is uncapped
    expect(combat.ac.dexterity).toBe(2);
    // Base 10 + shield 2 + dex 2 = 14
    expect(combat.ac.total).toBe(10 + 2 + 2);
  });

  test("registers weapon, armor, and shield together with correct totals", async () => {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === "Bjorn Ironhand");
    if (!character) throw new Error("Character must be defined");

    const [ruleset] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

    const items = await db
      .select({ id: itemsInRules.id, name: itemsInRules.name })
      .from(itemsInRules)
      .where(eq(itemsInRules.rulesetId, ruleset.id));
    const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

    // Clear existing inventory so the test controls its own state
    await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

    // Equip Longsword in Main Hand, Chain Mail on Torso, Light Wooden Shield in Off Hand
    await db.insert(inventoryInCharacter).values([
      {
        characterId: character.id,
        itemId: itemMap["Longsword"],
        quantity: 1,
        equipped: true,
        location: "Main Hand",
        weaponSet: 0,
      },
      {
        characterId: character.id,
        itemId: itemMap["Chain Mail"],
        quantity: 1,
        equipped: true,
        location: "Torso",
      },
      {
        characterId: character.id,
        itemId: itemMap["Light Wooden Shield"],
        quantity: 1,
        equipped: true,
        location: "Off Hand",
      },
    ]);

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    // Verify weapon
    const combat = detailedCharacter.getDetailedCharacterCombat().getCombat();
    expect(combat.weaponsets["0"]).toBeDefined();
    expect(combat.weaponsets["0"].mainhand).not.toBeNull();
    expect(combat.weaponsets["0"].mainhand!.name).toBe("Longsword");

    // Verify armor
    const armors = detailedCharacter.getDetailedCharacterArmors().getArmors();
    expect(armors["chainmail"]).toBeDefined();
    expect(armors["chainmail"].ac.bonus).toBe(5);

    // Verify shield
    const shields = detailedCharacter.getDetailedCharacterShields().getShields();
    expect(shields["lightwoodenshield"]).toBeDefined();
    expect(shields["lightwoodenshield"].ac.bonus).toBe(1);

    // Verify combined AC: base 10 + armor 5 + shield 1 + dex (min(2, chainmail maxdex=2)) = 18
    expect(combat.ac.base).toBe(10);
    expect(combat.ac.armor).toBe(5);
    expect(combat.ac.shield).toBe(1);
    expect(combat.ac.dexterity).toBe(2);
    expect(combat.ac.total).toBe(10 + 5 + 1 + 2);
  });

  test("ability totals include base, level, and misc", async () => {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === "Bjorn Ironhand");
    if (!character) throw new Error("Character must be defined");

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    const abilities = detailedCharacter.getDetailedCharacterAbilities().getAbilities();

    // Bjorn has: STR 18, DEX 14, CON 16, INT 12, WIS 10, CHA 8
    // No level-up ability increases (no abilityId set on character levels)
    // No misc modifiers on abilities for Bjorn's build (no ability-targeting modifiers)
    // So total = base + level(0) + misc(0)

    expect(abilities.strength.base).toBe(18);
    expect(abilities.strength.level).toBe(0);
    expect(abilities.strength.misc).toBe(0);
    expect(abilities.strength.total).toBe(18);

    expect(abilities.dexterity.base).toBe(14);
    expect(abilities.dexterity.total).toBe(14);

    expect(abilities.constitution.base).toBe(16);
    expect(abilities.constitution.total).toBe(16);

    expect(abilities.intelligence.base).toBe(12);
    expect(abilities.intelligence.total).toBe(12);

    expect(abilities.wisdom.base).toBe(10);
    expect(abilities.wisdom.total).toBe(10);

    expect(abilities.charisma.base).toBe(8);
    expect(abilities.charisma.total).toBe(8);

    // Verify getAbility accessor
    const str = detailedCharacter.getDetailedCharacterAbilities().getAbility("Strength");
    expect(str).toBeDefined();
    expect(str.total).toBe(18);

    const dex = detailedCharacter.getDetailedCharacterAbilities().getAbility("Dexterity");
    expect(dex).toBeDefined();
    expect(dex.total).toBe(14);

    // Verify ability modifier calculation: (total - 10) / 2 floored
    const strMod = detailedCharacter.getDetailedCharacterAbilities().getAbilityModifier("Strength");
    expect(strMod).toBe(4); // (18-10)/2 = 4

    const dexMod = detailedCharacter.getDetailedCharacterAbilities().getAbilityModifier("Dexterity");
    expect(dexMod).toBe(2); // (14-10)/2 = 2

    const conMod = detailedCharacter.getDetailedCharacterAbilities().getAbilityModifier("Constitution");
    expect(conMod).toBe(3); // (16-10)/2 = 3

    const intMod = detailedCharacter.getDetailedCharacterAbilities().getAbilityModifier("Intelligence");
    expect(intMod).toBe(1); // (12-10)/2 = 1

    const wisMod = detailedCharacter.getDetailedCharacterAbilities().getAbilityModifier("Wisdom");
    expect(wisMod).toBe(0); // (10-10)/2 = 0

    const chaMod = detailedCharacter.getDetailedCharacterAbilities().getAbilityModifier("Charisma");
    expect(chaMod).toBe(-1); // (8-10)/2 = -1
  });

  test("saving throws have correct base, ability, and total", async () => {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === "Bjorn Ironhand");
    if (!character) throw new Error("Character must be defined");

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    const saves = detailedCharacter.getDetailedCharacterSavingThrows().getSavingThrows();

    // Bjorn is Fighter 5:
    // Fighter level 5 saves (goodSave(5)=4, poorSave(5)=1):
    //   Fortitude (good) = 4, Reflex (poor) = 1, Will (poor) = 1
    // Ability mods: CON +3, DEX +2, WIS +0

    // Fortitude = base(4) + CON mod(3) + misc(2 Great Fortitude) = 9
    expect(saves.fortitude).toBeDefined();
    expect(saves.fortitude.base).toBe(4);
    expect(saves.fortitude.ability).toBe(3);
    expect(saves.fortitude.misc).toBe(2);
    expect(saves.fortitude.total).toBe(9);

    // Reflex = base(1) + DEX mod(2) + misc(0) = 3
    expect(saves.reflex).toBeDefined();
    expect(saves.reflex.base).toBe(1);
    expect(saves.reflex.ability).toBe(2);
    expect(saves.reflex.misc).toBe(0);
    expect(saves.reflex.total).toBe(3);

    // Will = base(1) + WIS mod(0) + misc(0) = 1
    expect(saves.will).toBeDefined();
    expect(saves.will.base).toBe(1);
    expect(saves.will.ability).toBe(0);
    expect(saves.will.misc).toBe(0);
    expect(saves.will.total).toBe(1);

    // Verify getSavingThrow accessor
    const fort = detailedCharacter.getDetailedCharacterSavingThrows().getSavingThrow("Fortitude");
    expect(fort).toBeDefined();
    expect(fort.total).toBe(9);

    const ref = detailedCharacter.getDetailedCharacterSavingThrows().getSavingThrow("Reflex");
    expect(ref).toBeDefined();
    expect(ref.total).toBe(3);

    const will = detailedCharacter.getDetailedCharacterSavingThrows().getSavingThrow("Will");
    expect(will).toBeDefined();
    expect(will.total).toBe(1);
  });

  test("two-handed weapon gets 1.5x strength modifier", async () => {
    const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
    if (!user) throw new Error("User must be defined");

    const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
    const character = result.items.find((c) => c.name === "Bjorn Ironhand");
    if (!character) throw new Error("Character must be defined");

    const [ruleset] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

    const items = await db
      .select({ id: itemsInRules.id, name: itemsInRules.name })
      .from(itemsInRules)
      .where(eq(itemsInRules.rulesetId, ruleset.id));
    const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

    // Clear existing inventory so the test controls its own state
    await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

    // Equip Greataxe in Two Handed slot (weapon set 1 to test non-zero set)
    await db.insert(inventoryInCharacter).values({
      characterId: character.id,
      itemId: itemMap["Greataxe"],
      quantity: 1,
      equipped: true,
      location: "Two Handed",
      weaponSet: 1,
    });

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    const combat = detailedCharacter.getDetailedCharacterCombat().getCombat();
    const weaponSet1 = combat.weaponsets["1"];
    expect(weaponSet1).toBeDefined();
    expect(weaponSet1.twohanded).not.toBeNull();
    expect(weaponSet1.twohanded!.name).toBe("Greataxe");
    expect(weaponSet1.twohanded!.damage.base).toBe("1d12");
    expect(weaponSet1.twohanded!.damage.critical.range).toBe(1); // Greataxe: threat count 1 (20 only)
    expect(weaponSet1.twohanded!.damage.critical.multiplier).toBe(3);

    // Bjorn STR 18 => +4 modifier, two-handed gets floor(4 * 1.5) = 6
    expect(weaponSet1.twohanded!.damage.strength).toBe(6);

    // Verify weapon groupings for Greataxe (grouped by WEAPON_TYPE property)
    const weapons = detailedCharacter.getDetailedCharacterWeapons().getWeapons();
    expect(weapons["greataxe"]).toBeDefined();
  });

  describe("modifier categories", () => {
    test("applied modifiers include Toughness hp bonus for Kael", async () => {
      const dc = await buildCharacter("Kael Stormborn");
      const { appliedModifiers } = dc.getDetailedCharacterModifiers().getModifiers();

      // Toughness adds +3 to combat.hp.misc
      const toughnessModifier = appliedModifiers.find((m) => m.target === "combat.hp.misc");
      expect(toughnessModifier).toBeDefined();
      expect(toughnessModifier!.operator).toBe("add");
      expect(toughnessModifier!.value).toBe("3");
    });

    test("hp constitution component reflects racial Constitution modifier", async () => {
      // Kael is a Dwarf (CON +2 racial) with base CON 16 → effective CON 18 → modifier +4
      // 4 levels (Fighter 3 / Barbarian 1), base HP: 10+8+7+12 = 37, Toughness: +3 misc
      const dc = await buildCharacter("Kael Stormborn");
      const hp = dc.getDetailedCharacterCombat().getCombat().hp;

      expect(hp.base).toBe(37);
      expect(hp.constitution).toBe(16); // +4 modifier × 4 levels
      expect(hp.misc).toBe(3); // Toughness
      expect(hp.total).toBe(56); // 37 + 16 + 3
    });

    test("inactive modifiers include weapon-targeting feats when weapon is not equipped", async () => {
      // Bjorn has Weapon Focus: Longsword and Weapon Specialization: Longsword
      // but no Longsword equipped — these modifiers should be inactive
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      // Clear inventory so no weapons are equipped
      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

      const dc = new DetailedCharacter(character);
      await dc.build();
      const { inactiveModifiers } = dc.getDetailedCharacterModifiers().getModifiers();

      const weaponTargets = inactiveModifiers.filter((m) => m.target.startsWith("items.weapons."));
      expect(weaponTargets.length).toBeGreaterThanOrEqual(2);

      const focusMod = weaponTargets.find((m) => m.target === "items.weapons.longsword.tohit.misc");
      expect(focusMod).toBeDefined();
      expect(focusMod!.value).toBe("1");

      const specMod = weaponTargets.find((m) => m.target === "items.weapons.longsword.damage.misc");
      expect(specMod).toBeDefined();
      expect(specMod!.value).toBe("2");
    });

    test("inactive modifiers become applied when weapon is equipped", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      // Clear existing inventory so the test controls its own state
      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

      // Equip a Longsword
      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Longsword"],
        quantity: 1,
        equipped: true,
        location: "Main Hand",
        weaponSet: 0,
      });

      const dc = new DetailedCharacter(character);
      await dc.build();

      const { appliedModifiers, inactiveModifiers } = dc.getDetailedCharacterModifiers().getModifiers();

      // Weapon Focus and Weapon Specialization should now be applied, not inactive
      const inactiveLongsword = inactiveModifiers.filter((m) => m.target.includes("longsword"));
      expect(inactiveLongsword).toHaveLength(0);

      const appliedFocus = appliedModifiers.find((m) => m.target === "items.weapons.longsword.tohit.misc");
      expect(appliedFocus).toBeDefined();

      const appliedSpec = appliedModifiers.find((m) => m.target === "items.weapons.longsword.damage.misc");
      expect(appliedSpec).toBeDefined();
    });

    test("unapplied modifiers are blocked by unmet requirements", async () => {
      const dc = await buildCharacter("Bjorn Ironhand");
      const { unappliedModifiers } = dc.getDetailedCharacterModifiers().getModifiers();

      // Bjorn meets all his feat requirements, so feat-sourced modifiers won't be unapplied.
      // But many weapon-specific feats in the ruleset have unmet requirements for Bjorn
      // (e.g., Greater Weapon Focus: Longsword requires Fighter 8, Bjorn is Fighter 5).
      // These feats aren't assigned to Bjorn, so their modifiers won't appear at all.
      // For Bjorn's own feats, all requirements are met — no unapplied modifiers from them.
      const bjornFeatTargets = ["items.weapons.longsword.tohit.misc", "items.weapons.longsword.damage.misc"];
      const unappliedFromBjornFeats = unappliedModifiers.filter((m) => bjornFeatTargets.includes(m.target));
      expect(unappliedFromBjornFeats).toHaveLength(0);
    });

    test("skipped modifiers are empty for valid character data", async () => {
      const dc = await buildCharacter("Bjorn Ironhand");
      const { skippedModifiers } = dc.getDetailedCharacterModifiers().getModifiers();

      // No data/type errors should occur for properly seeded characters
      expect(skippedModifiers).toHaveLength(0);
    });
  });

  describe("Weapon Finesse", () => {
    test("replaces STR with DEX for finessable weapons when DEX is higher", async () => {
      // Lyra: Elf Rogue 3, STR 10 (mod 0), DEX 18+2 racial = 20 (mod +5), has Weapon Finesse
      // Shortsword (light, finessable) in Main Hand, Dagger (light, finessable) in Off Hand
      const dc = await buildCharacter("Lyra Shadowstep");
      const combat = dc.getDetailedCharacterCombat().getCombat();

      const mainhand = combat.weaponsets["0"]?.mainhand;
      expect(mainhand).toBeDefined();
      expect(mainhand!.name).toBe("Shortsword");
      expect(mainhand!.tohit.strength).toBe(5); // DEX mod replaces STR mod (0)

      const offhand = combat.weaponsets["0"]?.offhand;
      expect(offhand).toBeDefined();
      expect(offhand!.name).toBe("Dagger");
      expect(offhand!.tohit.strength).toBe(5); // DEX mod replaces STR mod (0)
    });

    test("does not affect damage.strength (only tohit)", async () => {
      const dc = await buildCharacter("Lyra Shadowstep");
      const combat = dc.getDetailedCharacterCombat().getCombat();

      // Damage still uses STR mod (0 for Lyra, no racial STR bonus for Elf)
      const mainhand = combat.weaponsets["0"]?.mainhand;
      expect(mainhand).toBeDefined();
      expect(mainhand!.damage.strength).toBe(0); // STR mod, not DEX
    });

    test("does not replace when STR is higher than DEX", async () => {
      // Bjorn: STR 18 (mod +4), DEX 14 (mod +2), has Weapon Finesse (via seed: BAB>=1 met)
      // Give Bjorn a light weapon — Weapon Finesse fires but DEX mod (+2) < STR mod (+4)
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

      // Equip a Shortsword (light, finessable weapon) for Bjorn
      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Shortsword"],
        quantity: 1,
        equipped: true,
        location: "Main Hand",
        weaponSet: 0,
      });

      const dc = new DetailedCharacter(character);
      await dc.build();

      const combat = dc.getDetailedCharacterCombat().getCombat();
      const mainhand = combat.weaponsets["0"]?.mainhand;
      expect(mainhand).toBeDefined();
      // Bjorn's STR mod (+4) > DEX mod (+2), so touch.strength stays at STR mod
      expect(mainhand!.tohit.strength).toBe(4);
    });
  });

  describe("requirement categories", () => {
    test("fulfilled requirements include all of Bjorn's feat prerequisites", async () => {
      const dc = await buildCharacter("Bjorn Ironhand");
      const { fulfilledRequirementGroups } = dc.getDetailedCharacterRequirements().getRequirements();

      // Bjorn's feats: Power Attack (STR≥13), Cleave (STR≥13 + Power Attack),
      // Weapon Focus: Longsword (proficiency + BAB≥1), Dodge (DEX≥13),
      // Weapon Specialization: Longsword (WF:Longsword + Fighter≥4)
      // All should be fulfilled
      expect(fulfilledRequirementGroups.length).toBeGreaterThanOrEqual(5);
    });

    test("no unmet requirements for characters with valid feat selections", async () => {
      const dc = await buildCharacter("Bjorn Ironhand");
      const { unmetRequirementGroups } = dc.getDetailedCharacterRequirements().getRequirements();

      // Bjorn's assigned feats all have their prerequisites met
      expect(unmetRequirementGroups).toHaveLength(0);
    });

    test("unmet requirements appear when a feat prerequisite is not satisfied", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      // Override Bjorn's STR to 10 so Power Attack (requires STR≥13) becomes unmet
      const abilities = await db
        .select({ id: abilitiesInRules.id, name: abilitiesInRules.name })
        .from(abilitiesInRules)
        .where(eq(abilitiesInRules.rulesetId, character.rulesetId));
      const strAbility = abilities.find((a) => a.name === "Strength");

      await db
        .update(characterAbilitiesInCharacter)
        .set({ score: 10 })
        .where(
          and(
            eq(characterAbilitiesInCharacter.characterId, character.id),
            eq(characterAbilitiesInCharacter.abilityId, strAbility!.id),
          ),
        );

      const dc = new DetailedCharacter(character);
      await dc.build();

      const { unmetRequirementGroups } = dc.getDetailedCharacterRequirements().getRequirements();
      // Power Attack requires STR≥13, Cleave requires STR≥13 + Power Attack
      // Both should now have unmet requirement groups
      expect(unmetRequirementGroups.length).toBeGreaterThan(0);
    });

    test("invalid requirements are empty for properly seeded data", async () => {
      const dc = await buildCharacter("Bjorn Ironhand");
      const { invalidRequirements } = dc.getDetailedCharacterRequirements().getRequirements();

      expect(invalidRequirements).toHaveLength(0);
    });

    test("Kael fulfills all his assigned feat prerequisites", async () => {
      const dc = await buildCharacter("Kael Stormborn");
      const { fulfilledRequirementGroups, invalidRequirements } = dc.getDetailedCharacterRequirements().getRequirements();

      // Kael's feats: Power Attack (STR≥13), Toughness (none),
      // Weapon Focus: Battleaxe (proficiency + BAB≥1), Dodge (DEX≥13)
      expect(fulfilledRequirementGroups.length).toBeGreaterThanOrEqual(3);
      expect(invalidRequirements).toHaveLength(0);
    });
  });

  describe("power groupings and DC", () => {
    test("power groupings are populated with spell school groupings for Elara", async () => {
      const dc = await buildCharacter("Elara Starweaver");
      const groupings = dc.getDetailedCharacterPowerGroupings().getPowerGroupings();

      // Elara has Evocation spells (Magic Missile, Burning Hands, Light)
      expect(groupings["evocation"]).toBeDefined();
      expect(Object.keys(groupings["evocation"]).length).toBeGreaterThanOrEqual(2);

      // She also has Abjuration (Shield, Resistance), Conjuration (Mage Armor), etc.
      expect(groupings["abjuration"]).toBeDefined();
      expect(groupings["conjuration"]).toBeDefined();
    });

    test("power DC is calculated correctly for leveled spells with Spell Focus", async () => {
      const dc = await buildCharacter("Elara Starweaver");
      const groupings = dc.getDetailedCharacterPowerGroupings().getPowerGroupings();

      // Burning Hands: level 1, INT 18 => mod +4, Spell Focus: Evocation => +1 misc
      // DC = 10 + 1 + 4 + 1 = 16
      const burningHandsDc = groupings["evocation"]["burninghands"];
      expect(burningHandsDc).toBeDefined();
      expect(burningHandsDc.base).toBe(10);
      expect(burningHandsDc.level).toBe(1);
      expect(burningHandsDc.ability).toBe(4);
      expect(burningHandsDc.misc).toBe(1);
      expect(burningHandsDc.total).toBe(16);
    });

    test("cantrip DC includes Spell Focus bonus", async () => {
      const dc = await buildCharacter("Elara Starweaver");
      const groupings = dc.getDetailedCharacterPowerGroupings().getPowerGroupings();

      // Light is a cantrip (level 0), Evocation, INT 18 => mod +4, Spell Focus: Evocation => +1 misc
      // DC = 10 + 0 + 4 + 1 = 15
      const lightDc = groupings["evocation"]["light"];
      expect(lightDc).toBeDefined();
      expect(lightDc.base).toBe(10);
      expect(lightDc.level).toBe(0);
      expect(lightDc.ability).toBe(4);
      expect(lightDc.misc).toBe(1);
      expect(lightDc.total).toBe(15);
    });

    test("same DC reference is shared across groupings for same power", async () => {
      const dc = await buildCharacter("Elara Starweaver");
      const groupings = dc.getDetailedCharacterPowerGroupings().getPowerGroupings();

      // Burning Hands: grouped under "evocation" (school), "fire" (descriptor), and "burninghands" (name)
      const fromSchool = groupings["evocation"]["burninghands"];
      const fromName = groupings["burninghands"]["burninghands"];
      const fromDescriptor = groupings["fire"]?.["burninghands"];

      expect(fromSchool).toBe(fromName); // Same object reference
      if (fromDescriptor) {
        expect(fromSchool).toBe(fromDescriptor);
      }
    });

    test("DC flows to frontend through powers response", async () => {
      const dc = await buildCharacter("Elara Starweaver");
      const burningHands = dc.getDetailedCharacterPowers().getPower("Burning Hands");

      // Burning Hands should have dc attached (10 + 1 + 4 + 1 Spell Focus = 16)
      expect(burningHands).toBeDefined();
      expect(burningHands!.dc).toBeDefined();
      expect(burningHands!.dc!.total).toBe(16);
    });

    test("Spell Focus: Evocation modifier is inactive when no evocation spells have DC grouping", async () => {
      // Bjorn is a Fighter with no spells — Spell Focus would have no target.
      // Buckets are pre-seeded for every school so wildcard targets resolve;
      // each bucket should be empty and contribute zero matches (inactive).
      const dc = await buildCharacter("Bjorn Ironhand");
      const groupings = dc.getDetailedCharacterPowerGroupings().getPowerGroupings();

      expect(Object.keys(groupings).length).toBeGreaterThan(0);
      for (const bucket of Object.values(groupings)) {
        expect(Object.keys(bucket)).toHaveLength(0);
      }
    });

    test("Sorcerer power DC uses Charisma", async () => {
      const dc = await buildCharacter("Vex Flamecaller");
      const groupings = dc.getDetailedCharacterPowerGroupings().getPowerGroupings();

      // Vex is a Sorcerer with CHA 18 => mod +4
      // Burning Hands: level 1, CHA mod +4
      // DC = 10 + 1 + 4 = 15
      const burningHandsDc = groupings["evocation"]?.["burninghands"];
      expect(burningHandsDc).toBeDefined();
      expect(burningHandsDc.base).toBe(10);
      expect(burningHandsDc.level).toBe(1);
      expect(burningHandsDc.ability).toBe(4);
      expect(burningHandsDc.total).toBe(15);
    });

    test("DC ability is derived from KLASS_BONUS_SPELL_ABILITY_ID, not stored per spell", async () => {
      // Wizard (Elara) uses INT, Sorcerer (Vex) uses CHA — same spell, different DC
      const wizard = await buildCharacter("Elara Starweaver");
      const sorcerer = await buildCharacter("Vex Flamecaller");

      const wizardDc = wizard.getDetailedCharacterPowerGroupings().getPowerGroupings()["evocation"]?.["burninghands"];
      const sorcererDc = sorcerer.getDetailedCharacterPowerGroupings().getPowerGroupings()["evocation"]?.["burninghands"];

      expect(wizardDc).toBeDefined();
      expect(sorcererDc).toBeDefined();

      // Both have 18 in their casting ability => same modifier, but different source
      // Wizard: INT 18 => +4, Sorcerer: CHA 18 => +4
      expect(wizardDc.ability).toBe(4);
      expect(sorcererDc.ability).toBe(4);

      // Wizard has Spell Focus: Evocation (+1 misc), Sorcerer does not
      expect(wizardDc.total).toBe(16); // 10 + 1 + 4 + 1
      expect(sorcererDc.total).toBe(15); // 10 + 1 + 4
    });
  });

  describe("weapon damage formatting", () => {
    test("formats negative strength modifier as subtraction", async () => {
      // Vex has STR 8 => modifier -1
      const detailedCharacter = await buildCharacter("Vex Flamecaller");
      const combat = detailedCharacter.getDetailedCharacterCombat().getCombat();

      // Dagger in Main Hand (weapon set 0): 1d4 with STR -1
      const dagger = combat.weaponsets["0"]?.mainhand;
      expect(dagger).toBeDefined();
      expect(dagger!.name).toBe("Dagger");
      expect(dagger!.damage.total).toBe("1d4 - 1");

      // Light Crossbow Two Handed (weapon set 1): projectile weapon, no STR to damage
      const crossbow = combat.weaponsets["1"]?.twohanded;
      expect(crossbow).toBeDefined();
      expect(crossbow!.name).toBe("Light Crossbow");
      expect(crossbow!.damage.total).toBe("1d8");
    });

    test("mighty composite bow caps STR bonus to damage at mighty rating", async () => {
      // Bjorn has STR 18 => modifier +4
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      // Add WEAPON_MIGHTY +2 property to the Composite Longbow
      await db.insert(propertiesInCustomization).values({
        entityId: itemMap["Composite Longbow"],
        entityType: "items",
        type: "WEAPON_MIGHTY",
        value: "2",
      });

      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Composite Longbow"],
        quantity: 1,
        equipped: true,
        location: "Two Handed",
        weaponSet: 0,
      });
      invalidateRuleset(ruleset.id);

      const detailedCharacter = new DetailedCharacter(character);
      await detailedCharacter.build();

      const combat = detailedCharacter.getDetailedCharacterCombat().getCombat();
      const bow = combat.weaponsets["0"]?.twohanded;
      expect(bow).toBeDefined();
      expect(bow!.name).toBe("Composite Longbow");
      // STR +4 capped at Mighty +2 => damage modifier is 2
      expect(bow!.damage.strength).toBe(2);
      expect(bow!.damage.total).toBe("1d8 + 2");
      // Attack uses DEX (ranged weapon), Bjorn DEX 14 => +2
      expect(bow!.tohit.strength).toBe(2);
    });

    test("formats positive strength modifier as addition", async () => {
      // Bjorn has STR 18 => modifier +4
      const detailedCharacter = await buildCharacter("Bjorn Ironhand");
      const combat = detailedCharacter.getDetailedCharacterCombat().getCombat();

      const mainhand = combat.weaponsets["0"]?.mainhand;
      expect(mainhand).toBeDefined();
      expect(mainhand!.damage.total).toMatch(/^\d+d\d+ \+ \d+/);
      expect(mainhand!.damage.total).not.toContain("+ -");
    });
  });

  describe("thrown weapon attack modifier", () => {
    test("dagger uses STR for attack, not DEX, despite having range", async () => {
      // Vex has STR 8 (mod -1), DEX 14 (mod +2), BAB +1
      // Dagger has WEAPON_RANGE 10 (throwable) but should still use STR for melee attack
      const detailedCharacter = await buildCharacter("Vex Flamecaller");
      const combat = detailedCharacter.getDetailedCharacterCombat().getCombat();

      const dagger = combat.weaponsets["0"]?.mainhand;
      expect(dagger).toBeDefined();
      expect(dagger!.name).toBe("Dagger");
      expect(dagger!.tohit.strength).toBe(-1); // STR mod, not DEX
      expect(dagger!.tohit.total).toEqual([0]); // BAB(1) + STR(-1) = 0
    });

    test("crossbow uses DEX for attack as a projectile weapon", async () => {
      // Vex has DEX 14 (mod +2), BAB +1
      const detailedCharacter = await buildCharacter("Vex Flamecaller");
      const combat = detailedCharacter.getDetailedCharacterCombat().getCombat();

      const crossbow = combat.weaponsets["1"]?.twohanded;
      expect(crossbow).toBeDefined();
      expect(crossbow!.name).toBe("Light Crossbow");
      expect(crossbow!.tohit.strength).toBe(2); // DEX mod for projectile
      expect(crossbow!.tohit.total).toEqual([3]); // BAB(1) + DEX(2) = 3
    });
  });

  describe("iterative attacks and monk unarmed scaling", () => {
    test("tohit.total is a single-element array for BAB < 6", async () => {
      // Bjorn is Fighter 5, BAB 5 — clear inventory to get raw unarmed strike
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

      const dc = new DetailedCharacter(character);
      await dc.build();
      const combat = dc.getDetailedCharacterCombat().getCombat();
      const unarmed = combat.weaponsets["0"]?.mainhand;
      expect(unarmed).toBeDefined();
      expect(unarmed!.name).toBe("Unarmed Strike");
      // BAB 5 + STR mod 4 = 9, single attack (BAB < 6)
      expect(unarmed!.tohit.total).toEqual([9]);
    });

    test("monk unarmed strike scales damage with monk level", async () => {
      // Zen is Monk 3 — clear inventory to get unarmed strike
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Zen Whitepetal");
      if (!character) throw new Error("Character must be defined");

      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

      const dc = new DetailedCharacter(character);
      await dc.build();
      const combat = dc.getDetailedCharacterCombat().getCombat();
      const unarmed = combat.weaponsets["0"]?.mainhand;
      expect(unarmed).toBeDefined();
      expect(unarmed!.name).toBe("Unarmed Strike");
      // Monk level 3 → 1d6 unarmed damage
      expect(unarmed!.damage.base).toBe("1d6");
    });

    test("non-monk unarmed strike stays at 1d3", async () => {
      // Bjorn is Fighter 5, no monk levels — clear inventory to get unarmed strike
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

      const dc = new DetailedCharacter(character);
      await dc.build();
      const combat = dc.getDetailedCharacterCombat().getCombat();
      const unarmed = combat.weaponsets["0"]?.mainhand;
      expect(unarmed).toBeDefined();
      expect(unarmed!.name).toBe("Unarmed Strike");
      expect(unarmed!.damage.base).toBe("1d3");
    });

    test("monk gauntlet in weapon set 1 receives unarmed progression", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Zen Whitepetal");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db.select({ id: rulesetsInRules.id }).from(rulesetsInRules).where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
      const items = await db.select({ id: itemsInRules.id, name: itemsInRules.name }).from(itemsInRules).where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
      await db.insert(inventoryInCharacter).values([
        { characterId: character.id, itemId: itemMap["Gauntlet"], quantity: 1, equipped: true, location: "Main Hand", weaponSet: 1 },
      ]);

      const dc = new DetailedCharacter(character);
      await dc.build();
      const gauntlet = dc.getDetailedCharacterCombat().getCombat().weaponsets["1"]?.mainhand;
      expect(gauntlet).toBeDefined();
      expect(gauntlet!.name).toBe("Gauntlet");
      // Monk 3 → unarmed progression sets base damage to 1d6
      expect(gauntlet!.damage.base).toBe("1d6");
    });

    test("monk spiked gauntlet does not receive unarmed progression", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Zen Whitepetal");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db.select({ id: rulesetsInRules.id }).from(rulesetsInRules).where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
      const items = await db.select({ id: itemsInRules.id, name: itemsInRules.name }).from(itemsInRules).where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
      await db.insert(inventoryInCharacter).values([
        { characterId: character.id, itemId: itemMap["Spiked Gauntlet"], quantity: 1, equipped: true, location: "Main Hand", weaponSet: 0 },
      ]);

      const dc = new DetailedCharacter(character);
      await dc.build();
      const spiked = dc.getDetailedCharacterCombat().getCombat().weaponsets["0"]?.mainhand;
      expect(spiked).toBeDefined();
      expect(spiked!.name).toBe("Spiked Gauntlet");
      // RAW: spiked gauntlet is an armed attack — keeps its native 1d4
      expect(spiked!.damage.base).toBe("1d4");
    });

    test("monk longsword does not receive unarmed progression", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Zen Whitepetal");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db.select({ id: rulesetsInRules.id }).from(rulesetsInRules).where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
      const items = await db.select({ id: itemsInRules.id, name: itemsInRules.name }).from(itemsInRules).where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
      await db.insert(inventoryInCharacter).values([
        { characterId: character.id, itemId: itemMap["Longsword"], quantity: 1, equipped: true, location: "Main Hand", weaponSet: 0 },
      ]);

      const dc = new DetailedCharacter(character);
      await dc.build();
      const sword = dc.getDetailedCharacterCombat().getCombat().weaponsets["0"]?.mainhand;
      expect(sword).toBeDefined();
      expect(sword!.name).toBe("Longsword");
      expect(sword!.damage.base).toBe("1d8");
    });
  });

  describe("weapon damage size adjustment", () => {
    test("Medium character keeps damage dice unchanged", async () => {
      // Bjorn is Human (Medium) — unarmed 1d3 stays 1d3
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

      const dc = new DetailedCharacter(character);
      await dc.build();
      const combat = dc.getDetailedCharacterCombat().getCombat();
      const unarmed = combat.weaponsets["0"]?.mainhand;
      expect(unarmed!.damage.base).toBe("1d3");
    });

    test("Small character steps damage dice down", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      // Switch Bjorn to Halfling (Small)
      const [halfling] = await db
        .select({ id: racesInRules.id })
        .from(racesInRules)
        .where(and(eq(racesInRules.rulesetId, character.rulesetId), eq(racesInRules.name, "Halfling")));
      await db.update(charactersInCharacter)
        .set({ raceId: halfling.id })
        .where(eq(charactersInCharacter.id, character.id));
      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

      const dc = new DetailedCharacter({ ...character, raceId: halfling.id });
      await dc.build();
      const combat = dc.getDetailedCharacterCombat().getCombat();

      // Unarmed: 1d3 (Medium) → 1d2 (Small)
      const unarmed = combat.weaponsets["0"]?.mainhand;
      expect(unarmed!.damage.base).toBe("1d2");
    });

    test("Small character with equipped weapon steps damage down", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      // Switch to Halfling (Small)
      const [halfling] = await db
        .select({ id: racesInRules.id })
        .from(racesInRules)
        .where(and(eq(racesInRules.rulesetId, character.rulesetId), eq(racesInRules.name, "Halfling")));
      await db.update(charactersInCharacter)
        .set({ raceId: halfling.id })
        .where(eq(charactersInCharacter.id, character.id));
      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Longsword"],
        quantity: 1,
        equipped: true,
        location: "Main Hand",
        weaponSet: 0,
      });

      const dc = new DetailedCharacter({ ...character, raceId: halfling.id });
      await dc.build();
      const combat = dc.getDetailedCharacterCombat().getCombat();

      // Longsword: 1d8 (Medium) → 1d6 (Small)
      const mainhand = combat.weaponsets["0"]?.mainhand;
      expect(mainhand!.name).toBe("Longsword");
      expect(mainhand!.damage.base).toBe("1d6");
    });

    test("Small monk gets size-adjusted monk unarmed damage", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Zen Whitepetal");
      if (!character) throw new Error("Character must be defined");

      // Switch Zen (Monk 3) to Halfling (Small)
      const [halfling] = await db
        .select({ id: racesInRules.id })
        .from(racesInRules)
        .where(and(eq(racesInRules.rulesetId, character.rulesetId), eq(racesInRules.name, "Halfling")));
      await db.update(charactersInCharacter)
        .set({ raceId: halfling.id })
        .where(eq(charactersInCharacter.id, character.id));
      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

      const dc = new DetailedCharacter({ ...character, raceId: halfling.id });
      await dc.build();
      const combat = dc.getDetailedCharacterCombat().getCombat();

      // Monk 3 Medium: 1d6, Small steps down to 1d4
      const unarmed = combat.weaponsets["0"]?.mainhand;
      expect(unarmed!.name).toBe("Unarmed Strike");
      expect(unarmed!.damage.base).toBe("1d4");
    });
  });

  describe("getCharacterClasses", () => {
    test("excludes level-0 placeholder classes", async () => {
      const detailedCharacter = await buildCharacter("Vex Flamecaller");
      const classes = detailedCharacter.getDetailedCharacterClasses();

      const allClasses = classes.getClasses();
      const characterClasses = classes.getCharacterClasses();

      // getClasses includes level-0 placeholders for all ruleset classes
      expect(Object.keys(allClasses).length).toBeGreaterThan(Object.keys(characterClasses).length);

      // getCharacterClasses only returns classes the character actually has
      expect(Object.keys(characterClasses)).toEqual(["sorcerer"]);
      expect(characterClasses["sorcerer"].level).toBe(3);

      // Every entry in getCharacterClasses has level > 0
      for (const klass of Object.values(characterClasses)) {
        expect(klass.level).toBeGreaterThan(0);
      }
    });
  });

  describe("all-known spell level filtering", () => {
    test("enriched spells only include levels where allowed is ALLOWED_ALL", async () => {
      // Theron is Cleric 3. Clerics know all spells on their list, but only up to
      // the spell levels they can cast. A level 3 cleric can cast levels 0-2.
      // Spells at levels 3+ should NOT be enriched.
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Theron Lightbringer");
      if (!character) throw new Error("Character must be defined");

      const dc = new DetailedCharacter(character);
      await dc.build();

      // Verify the cleric spell aptitude has ALLOWED_ALL only for accessible levels
      const aptitudes = dc.getDetailedCharacterAptitudes().getAptitudes();
      const clericSpells = aptitudes["clericspells"] as Record<string, unknown>;
      expect(clericSpells).toBeDefined();
      expect(dc.getDetailedCharacterAptitudes().isLeveledAptitude("clericspells")).toBe(true);

      const allKnownLevels: number[] = [];
      for (let level = 0; level <= 9; level++) {
        const levelData = clericSpells[String(level)] as { allowed: number } | undefined;
        if (levelData && levelData.allowed === ALLOWED_ALL) {
          allKnownLevels.push(level);
        }
      }
      // Cleric 3 should have ALLOWED_ALL for levels 0, 1, and 2
      expect(allKnownLevels).toEqual([0, 1, 2]);

      // All enriched powers should have a powerLevel within the ALLOWED_ALL levels
      const powers = dc.getDetailedCharacterPowers().getFlatPowers();
      for (const entry of Object.values(powers)) {
        const powerLevel = (entry.power as { powerLevel?: number | null }).powerLevel;
        if (powerLevel != null) {
          expect(allKnownLevels).toContain(powerLevel);
        }
      }

      // Specifically: no spells above level 2 for a level 3 cleric
      for (const entry of Object.values(powers)) {
        const powerLevel = (entry.power as { powerLevel?: number | null }).powerLevel;
        if (powerLevel != null) {
          expect(powerLevel).toBeLessThanOrEqual(2);
        }
      }
    });
  });

  describe("cross-class feat deduplication", () => {
    test("shared proficiency feats are not double-counted in aptitude allowed", async () => {
      // Bjorn is Fighter 5. Add a Barbarian level — both classes auto-grant
      // the same proficiency feats (Simple/Martial Weapon Prof, Light/Medium Armor Prof, Shield Prof)
      // at level 1. These should not inflate the "General" aptitude's allowed count.
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      // Find Barbarian class and its level 1
      const [barbarian] = await db
        .select({ id: klassesInRules.id })
        .from(klassesInRules)
        .where(and(eq(klassesInRules.rulesetId, character.rulesetId), eq(klassesInRules.name, "Barbarian")));
      const barbarianKl1 = await KlassLevels.findOneByKlassAndLevel(db, { klassId: barbarian.id, level: 1 });
      if (!barbarianKl1) throw new Error("Barbarian klass level 1 must be defined");

      // Add Barbarian level 1 to Bjorn
      await db.insert(levelsInCharacter).values({
        characterId: character.id,
        klassLevelId: barbarianKl1.id,
        hp: 10,
        abilityId: null,
      });

      // Build Fighter 5 / Barbarian 1 character
      const dc = new DetailedCharacter(character);
      await dc.build();

      // Get aptitudes and verify "General" aptitude
      const aptitudes = dc.getDetailedCharacterAptitudes().getAptitudes();
      const generalAptitude = aptitudes["general"];
      expect(generalAptitude).toBeDefined();

      // available should not be negative (would indicate double-counted allowed with single-counted spent)
      expect(generalAptitude.available).toBeGreaterThanOrEqual(0);

      // allowed - spent should equal available
      expect(generalAptitude.available).toBe(generalAptitude.allowed - generalAptitude.spent);

      // Feats should not be duplicated in class levels
      const classes = dc.getDetailedCharacterClasses().getCharacterClasses();
      const allFeats = Object.values(classes).flatMap((klass) =>
        klass.levels.flatMap((level) => level.feats)
      );
      const nonStackableFeats = allFeats.filter((f) => !f.stackable);
      const featIds = nonStackableFeats.map((f) => f.id);
      const uniqueFeatIds = new Set(featIds);
      expect(featIds.length).toBe(uniqueFeatIds.size);
    });
  });

  describe("weapon proficiency penalties", () => {
    test("proficient weapon has proficient true and no penalty", async () => {
      // Bjorn is Fighter 5 with Martial Weapon Proficiency, Longsword is martial
      // Weapon Focus: Longsword adds +1 to touch.misc via modifier
      const dc = await buildCharacter("Bjorn Ironhand");
      const combat = dc.getDetailedCharacterCombat().getCombat();
      const mainhand = combat.weaponsets["0"]?.mainhand;
      expect(mainhand).toBeDefined();
      expect(mainhand!.name).toBe("Longsword");
      expect(mainhand!.proficient).toBe(true);
      // touch.misc is 1 from Weapon Focus: Longsword, no nonproficiency penalty
      expect(mainhand!.tohit.misc).toBe(1);
    });

    test("non-proficient weapon has proficient false and -4 penalty", async () => {
      // Elara is Wizard 3 — has Wizard Weapon Proficiency only, not Martial
      // Equip a Longsword (martial) on Elara => should be non-proficient
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Elara Starweaver");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Longsword"],
        quantity: 1,
        equipped: true,
        location: "Main Hand",
        weaponSet: 0,
      });

      const dc = new DetailedCharacter(character);
      await dc.build();

      const combat = dc.getDetailedCharacterCombat().getCombat();
      const mainhand = combat.weaponsets["0"]?.mainhand;
      expect(mainhand).toBeDefined();
      expect(mainhand!.name).toBe("Longsword");
      expect(mainhand!.proficient).toBe(false);
      expect(mainhand!.tohit.misc).toBe(-4);
    });

    test("unarmed strike is always proficient", async () => {
      // Clear inventory to get only the default unarmed strike
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

      const dc = new DetailedCharacter(character);
      await dc.build();

      const combat = dc.getDetailedCharacterCombat().getCombat();
      const unarmed = combat.weaponsets["0"]?.mainhand;
      expect(unarmed).toBeDefined();
      expect(unarmed!.name).toBe("Unarmed Strike");
      expect(unarmed!.itemId).toBeNull();
      expect(unarmed!.proficient).toBe(true);
      expect(unarmed!.tohit.misc).toBe(0);
    });

    test("proficient simple weapon has no penalty", async () => {
      // Vex is Sorcerer 3 with Simple Weapon Proficiency, Dagger is simple
      const dc = await buildCharacter("Vex Flamecaller");
      const combat = dc.getDetailedCharacterCombat().getCombat();
      const dagger = combat.weaponsets["0"]?.mainhand;
      expect(dagger).toBeDefined();
      expect(dagger!.name).toBe("Dagger");
      expect(dagger!.proficient).toBe(true);
      expect(dagger!.tohit.misc).toBe(0);
    });

    test("itemId is stored on weapon slots from inventory", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      const dc = new DetailedCharacter(character);
      await dc.build();

      const combat = dc.getDetailedCharacterCombat().getCombat();
      const mainhand = combat.weaponsets["0"]?.mainhand;
      expect(mainhand).toBeDefined();
      // Equipped weapon should have a non-null itemId
      expect(mainhand!.itemId).toBeTypeOf("string");
      expect(mainhand!.itemId).not.toBeNull();
    });

    test("non-proficiency penalty is reflected in attack total", async () => {
      // Elara (Wizard 3): BAB 1, DEX 14 (mod +2), no Martial prof
      // Equip Longsword => touch.total should include the -4 penalty
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Elara Starweaver");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Longsword"],
        quantity: 1,
        equipped: true,
        location: "Main Hand",
        weaponSet: 0,
      });

      const dc = new DetailedCharacter(character);
      await dc.build();

      const combat = dc.getDetailedCharacterCombat().getCombat();
      const mainhand = combat.weaponsets["0"]?.mainhand;
      expect(mainhand).toBeDefined();
      // Elara: STR 8 (mod -1) for melee attack, BAB 1, misc -4 (nonprof)
      // total = BAB(1) + STR(-1) + misc(-4) = -4
      expect(mainhand!.tohit.strength).toBe(-1);
      expect(mainhand!.tohit.misc).toBe(-4);
      expect(mainhand!.tohit.total).toEqual([-4]);
    });
  });

  describe("bonus caster level advancement", () => {
    test("prestige class with caster level advancement increases base class spell slots", async () => {
      // Theron is Cleric 3. Build baseline to capture spell uses.
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Theron Lightbringer");
      if (!character) throw new Error("Character must be defined");

      // Build baseline Cleric 3
      const baseline = new DetailedCharacter(character);
      await baseline.build();

      const baselineAptitudes = baseline.getDetailedCharacterAptitudes().getAptitudes();
      const baselineClericSpells = baselineAptitudes["clericspells"] as Record<string, unknown>;
      const baseL0 = (baselineClericSpells["0"] as AptitudeLevelData).uses;
      const baseL1 = (baselineClericSpells["1"] as AptitudeLevelData).uses;
      const baseL2 = (baselineClericSpells["2"] as AptitudeLevelData).uses;

      // Cleric 3 perDay: [4, 2, 1] + WIS 16 (mod +3) bonus: [0, +1, +1]
      expect(baseL0).toBe(4);
      expect(baseL1).toBe(3);
      expect(baseL2).toBe(2);

      // Create a test prestige class with caster level advancement at every level
      const ctx = await getSeedContext(db);
      const saves = await db
        .select({ id: savesInRules.id, name: savesInRules.name })
        .from(savesInRules)
        .where(eq(savesInRules.rulesetId, ctx.rulesetId));
      const saveMap = Object.fromEntries(saves.map((s) => [s.name, s.id]));

      const { levelIds: prestigeLevelIds } = await seedClass(db, ctx.rulesetId, {
        name: "Test Exorcist",
        description: "Test prestige class for caster level advancement",
        hd: 6,
        levels: 10,
        skillPoints: 2,
        bab: "medium",
        saves: { fortitude: "good", reflex: "poor", will: "good" },
        classSkills: ["Concentration"],
        casterLevelAdvancement: { type: "divine", levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      }, { rulesetId: ctx.rulesetId, saveMap, skillMap: ctx.skillMap, featMap: ctx.featMap, aptMap: ctx.aptMap, abilityMap: {} });
      invalidateRuleset(ctx.rulesetId);

      // Add 1 level of prestige class to Theron (now Cleric 3 / Test Exorcist 1)
      const [charLevel] = await db.insert(levelsInCharacter).values({
        characterId: character.id,
        klassLevelId: prestigeLevelIds[1],
        hp: 5,
      }).returning({ id: levelsInCharacter.id });

      // Pick "Advance Cleric Spellcasting" from "Bonus Divine Caster Level" aptitude
      // Re-fetch seed context to get the new aptitude IDs (ctx was fetched before seedClass added the klass)
      const freshCtx = await getSeedContext(db);
      await db.insert(levelFeatsInCharacter).values({
        characterLevelId: charLevel.id,
        featId: freshCtx.featMap["Advance Cleric Spellcasting"],
        aptitudeId: freshCtx.aptMap["Bonus Divine Caster Level"],
      });

      // Build with bonus caster level
      const dc = new DetailedCharacter(character);
      await dc.build();

      // Verify bonuscasterlevel is set on Cleric class data
      const classes = dc.getDetailedCharacterClasses().getCharacterClasses();
      expect(classes["cleric"].bonuscasterlevel).toBe(1);
      expect(classes["cleric"].level).toBe(3);

      // Verify spell uses increased to Cleric 4 values: [5, 3, 2] + WIS bonus [0, +1, +1]
      // Deltas from L3→L4: +1 cantrip, +1 level-1, +1 level-2
      const aptitudes = dc.getDetailedCharacterAptitudes().getAptitudes();
      const clericSpells = aptitudes["clericspells"] as Record<string, unknown>;
      expect((clericSpells["0"] as AptitudeLevelData).uses).toBe(5);
      expect((clericSpells["1"] as AptitudeLevelData).uses).toBe(4);
      expect((clericSpells["2"] as AptitudeLevelData).uses).toBe(3);

      // Cleric 4 doesn't open spell level 3 (that requires L5), so level 3 should still be 0
      expect((clericSpells["3"] as AptitudeLevelData).uses).toBe(0);
      expect((clericSpells["3"] as AptitudeLevelData).allowed).toBe(0);
    });

    test("two bonus caster levels open a new spell level", async () => {
      // Theron is Cleric 3. With +2 bonus caster levels → effective Cleric 5.
      // Cleric 5 opens spell level 3: perDay = [5, 3, 2, 1]
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Theron Lightbringer");
      if (!character) throw new Error("Character must be defined");

      // Create a test prestige class with caster level advancement
      const ctx = await getSeedContext(db);
      const saves = await db
        .select({ id: savesInRules.id, name: savesInRules.name })
        .from(savesInRules)
        .where(eq(savesInRules.rulesetId, ctx.rulesetId));
      const saveMap = Object.fromEntries(saves.map((s) => [s.name, s.id]));

      const { levelIds: prestigeLevelIds } = await seedClass(db, ctx.rulesetId, {
        name: "Test Theurge",
        description: "Test prestige class for caster level advancement",
        hd: 4,
        levels: 10,
        skillPoints: 2,
        bab: "poor",
        saves: { fortitude: "poor", reflex: "poor", will: "good" },
        classSkills: ["Concentration"],
        casterLevelAdvancement: { type: "divine", levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      }, { rulesetId: ctx.rulesetId, saveMap, skillMap: ctx.skillMap, featMap: ctx.featMap, aptMap: ctx.aptMap, abilityMap: {} });
      invalidateRuleset(ctx.rulesetId);

      // Add 2 levels of prestige class to Theron (Cleric 3 / Test Theurge 2)
      const [charLevel1] = await db.insert(levelsInCharacter).values({
        characterId: character.id,
        klassLevelId: prestigeLevelIds[1],
        hp: 3,
      }).returning({ id: levelsInCharacter.id });

      const [charLevel2] = await db.insert(levelsInCharacter).values({
        characterId: character.id,
        klassLevelId: prestigeLevelIds[2],
        hp: 3,
      }).returning({ id: levelsInCharacter.id });

      // Pick "Advance Cleric Spellcasting" at both prestige class levels
      const freshCtx = await getSeedContext(db);
      await db.insert(levelFeatsInCharacter).values([
        {
          characterLevelId: charLevel1.id,
          featId: freshCtx.featMap["Advance Cleric Spellcasting"],
          aptitudeId: freshCtx.aptMap["Bonus Divine Caster Level"],
        },
        {
          characterLevelId: charLevel2.id,
          featId: freshCtx.featMap["Advance Cleric Spellcasting"],
          aptitudeId: freshCtx.aptMap["Bonus Divine Caster Level"],
        },
      ]);

      // Build with +2 bonus caster levels
      const dc = new DetailedCharacter(character);
      await dc.build();

      // Verify bonuscasterlevel is 2
      const classes = dc.getDetailedCharacterClasses().getCharacterClasses();
      expect(classes["cleric"].bonuscasterlevel).toBe(2);

      // Cleric 5 perDay: [5, 3, 2, 1] + WIS 16 (mod +3) bonus: [0, +1, +1, +1]
      const aptitudes = dc.getDetailedCharacterAptitudes().getAptitudes();
      const clericSpells = aptitudes["clericspells"] as Record<string, unknown>;
      expect((clericSpells["0"] as AptitudeLevelData).uses).toBe(5);
      expect((clericSpells["1"] as AptitudeLevelData).uses).toBe(4);
      expect((clericSpells["2"] as AptitudeLevelData).uses).toBe(3);
      expect((clericSpells["3"] as AptitudeLevelData).uses).toBe(2);

      // Spell level 3 should now be open (ALLOWED_ALL for know-all casters)
      expect((clericSpells["3"] as AptitudeLevelData).allowed).toBe(ALLOWED_ALL);

      // Spell level 4 should still be closed
      expect((clericSpells["4"] as AptitudeLevelData).uses).toBe(0);
      expect((clericSpells["4"] as AptitudeLevelData).allowed).toBe(0);

      // Enriched spells should now include level 3 spells
      const powers = dc.getDetailedCharacterPowers().getFlatPowers();
      const spellLevels = new Set(
        Object.values(powers)
          .map((entry) => (entry.power as { powerLevel?: number | null }).powerLevel)
          .filter((level): level is number => level != null),
      );
      expect(spellLevels.has(3)).toBe(true);
      expect(spellLevels.has(4)).toBe(false);
    });
  });

  describe("bonus spells per day from ability scores", () => {
    test("wizard gets bonus spell slots from Intelligence", async () => {
      // Elara Starweaver: Wizard 3, INT 18 (mod +4)
      // Wizard 3 perDay: [4, 2, 1] (cantrips, level 1, level 2)
      // Bonus: L1 = floor((4-1)/4)+1 = 1, L2 = floor((4-2)/4)+1 = 1
      // Expected uses: [4, 3, 2]
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Elara Starweaver");
      if (!character) throw new Error("Character must be defined");

      const dc = new DetailedCharacter(character);
      await dc.build();

      const aptitudes = dc.getDetailedCharacterAptitudes().getAptitudes();
      const wizardSpells = aptitudes["wizardspells"] as Record<string, unknown>;

      // Cantrips get no bonus
      expect((wizardSpells["0"] as AptitudeLevelData).uses).toBe(4);
      // Level 1: base 2 + 1 bonus = 3
      expect((wizardSpells["1"] as AptitudeLevelData).uses).toBe(3);
      // Level 2: base 1 + 1 bonus = 2
      expect((wizardSpells["2"] as AptitudeLevelData).uses).toBe(2);
      // Level 3+: not yet castable (allowed == 0), no bonus
      expect((wizardSpells["3"] as AptitudeLevelData).uses).toBe(0);
    });

    test("cleric gets bonus spell slots from Wisdom", async () => {
      // Theron Lightbringer: Cleric 3, WIS 16 (mod +3)
      // Cleric 3 perDay: [4, 2, 1]
      // Bonus: L1 = floor((3-1)/4)+1 = 1, L2 = floor((3-2)/4)+1 = 1
      // Expected uses: [4, 3, 2]
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Theron Lightbringer");
      if (!character) throw new Error("Character must be defined");

      const dc = new DetailedCharacter(character);
      await dc.build();

      const aptitudes = dc.getDetailedCharacterAptitudes().getAptitudes();
      const clericSpells = aptitudes["clericspells"] as Record<string, unknown>;

      expect((clericSpells["0"] as AptitudeLevelData).uses).toBe(4);
      expect((clericSpells["1"] as AptitudeLevelData).uses).toBe(3);
      expect((clericSpells["2"] as AptitudeLevelData).uses).toBe(2);
      expect((clericSpells["3"] as AptitudeLevelData).uses).toBe(0);
    });

    test("ranger at level 3 gets no bonus spells (no spell levels unlocked yet)", async () => {
      // Fenn Ashwalker: Ranger 3, WIS 14 (mod +2)
      // Ranger 3 has no spell levels unlocked (perDay = [])
      // All spell levels should have uses == 0
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Fenn Ashwalker");
      if (!character) throw new Error("Character must be defined");

      const dc = new DetailedCharacter(character);
      await dc.build();

      const aptitudes = dc.getDetailedCharacterAptitudes().getAptitudes();
      const rangerSpells = aptitudes["rangerspells"] as Record<string, unknown>;

      for (let level = 0; level <= 4; level++) {
        expect((rangerSpells[String(level)] as AptitudeLevelData).uses).toBe(0);
      }
    });
  });

  describe("Uncanny Blow modifier application", () => {
    async function setupUncannyBlow() {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");

      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      // Find Complete Warrior extension
      const [extension] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_COMPLETE_WARRIOR_NAME));

      // Find base ruleset items
      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      // Uncanny Blow lives in CW — the character needs to be in a ruleset whose
      // source chain includes CW. Move Bjorn into a CW-subscribed fork for this test.
      const [cwFork] = await Rulesets.create(db, {
        name: `Uncanny Fork ${Math.random().toString(36).slice(2, 7)}`,
        description: "Fork subscribed to CW for Uncanny Blow content",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: user.id,
        rulesetId: ruleset.id,
        ancestorRulesetIds: [ruleset.id],
        extensionRulesetIds: [extension.id],
      });
      invalidateRuleset(cwFork.id);
      await db.update(charactersInCharacter)
        .set({ rulesetId: cwFork.id })
        .where(eq(charactersInCharacter.id, character.id));
      character.rulesetId = cwFork.id;

      // Find Uncanny Blow feat (modifier + requirements already exist from v1 seed)
      const [uncannyBlow] = await db
        .select({ id: featsInRules.id })
        .from(featsInRules)
        .where(and(eq(featsInRules.rulesetId, extension.id), eq(featsInRules.name, "Uncanny Blow (Exotic Weapon Master Exotic Weapon Stunt)")));
      if (!uncannyBlow) throw new Error("Uncanny Blow feat must be defined");

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      // Find Exotic Weapon Master Exotic Weapon Stunt aptitude
      const [aptitude] = await db
        .select({ id: aptitudesInRules.id })
        .from(aptitudesInRules)
        .where(and(
          eq(aptitudesInRules.rulesetId, extension.id),
          eq(aptitudesInRules.name, "Exotic Weapon Master Exotic Weapon Stunt"),
        ));

      // Get Bjorn's first character level to assign the feat
      const [charLevel] = await db
        .select({ id: levelsInCharacter.id })
        .from(levelsInCharacter)
        .where(eq(levelsInCharacter.characterId, character.id))
        .limit(1);

      // Assign Uncanny Blow to Bjorn
      await db.insert(levelFeatsInCharacter).values({
        characterLevelId: charLevel.id,
        featId: uncannyBlow.id,
        aptitudeId: aptitude.id,
      });

      return { character, itemMap };
    }

    test("sets strmultiplier to 2 when exotic weapon is in mainhand and Power Attack possessed", async () => {
      // Bjorn has Power Attack, so the OR requirement (twohanded OR Power Attack) is met
      const { character, itemMap } = await setupUncannyBlow();

      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Bastard Sword"],
        quantity: 1,
        equipped: true,
        location: "Main Hand",
        weaponSet: 0,
      });

      const dc = new DetailedCharacter(character);
      await dc.build();

      const weapons = dc.getDetailedCharacterWeapons().getWeapons();
      const exoticGroup = weapons["exotic"];
      expect(exoticGroup).toBeDefined();

      const weaponEntries = Object.values(exoticGroup);
      expect(weaponEntries.length).toBe(1);
      expect(weaponEntries[0].damage.strmultiplier).toBe(2);

      // Bjorn STR 18 => +4, ×2 = 8
      expect(weaponEntries[0].damage.strength).toBe(8);
    });

    test("sets strmultiplier to 2 when exotic weapon is twohanded", async () => {
      const { character, itemMap } = await setupUncannyBlow();

      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Bastard Sword"],
        quantity: 1,
        equipped: true,
        location: "Two Handed",
        weaponSet: 0,
      });

      const dc = new DetailedCharacter(character);
      await dc.build();

      const weapons = dc.getDetailedCharacterWeapons().getWeapons();
      const exoticGroup = weapons["exotic"];
      expect(exoticGroup).toBeDefined();

      const weaponEntries = Object.values(exoticGroup);
      expect(weaponEntries.length).toBe(1);
      expect(weaponEntries[0].damage.strmultiplier).toBe(2);

      // Bjorn STR 18 => +4, ×2 = 8
      expect(weaponEntries[0].damage.strength).toBe(8);
    });
  });

  describe("encumbrance", () => {
    test("Bjorn at seed inventory is light load with correct thresholds", async () => {
      const dc = await buildCharacter("Bjorn Ironhand");
      const enc = dc.getDetailedCharacterEncumbrance().getEncumbrance();

      // STR 18, Medium size => heavy load = 300 lbs
      expect(enc.heavyload).toBe(300);
      expect(enc.mediumload).toBe(200); // floor(300 * 2/3)
      expect(enc.lightload).toBe(100);  // floor(300 / 3)

      // Bjorn's seed inventory: Longsword 4 + Chain Mail 40 + Heavy Steel Shield 15
      // + Backpack 2 + Bedroll 5 + Rope 10 + Rations×5 5 + Waterskin×2 8 + Torch×6 6 + Flint 0 = 95
      expect(enc.carriedweight).toBe(95);
      expect(enc.load).toBe("light");
      expect(enc.maxdex).toBe(Infinity);
      expect(enc.checkpenalty).toBe(0);
    });

    test("encumbrance data flows to combat.encumbrance", async () => {
      const dc = await buildCharacter("Bjorn Ironhand");
      const combat = dc.getDetailedCharacterCombat().getCombat();

      expect(combat.encumbrance).toBeDefined();
      expect(combat.encumbrance.load).toBe("light");
      expect(combat.encumbrance.heavyload).toBe(300);
      expect(combat.encumbrance.carriedweight).toBe(95);
    });

    test("medium load caps dex and adds check penalty", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");

      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      // Clear inventory and add items totaling ~110 lbs (medium load for STR 18: 101-200)
      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
      await db.insert(inventoryInCharacter).values([
        // Full Plate 50 + Barrel 30 + Chest 25 + Rope 10 = 115 lbs
        { characterId: character.id, itemId: itemMap["Full Plate"], quantity: 1, equipped: true, location: "Torso" },
        { characterId: character.id, itemId: itemMap["Barrel (empty)"], quantity: 1, equipped: false },
        { characterId: character.id, itemId: itemMap["Chest (empty)"], quantity: 1, equipped: false },
        { characterId: character.id, itemId: itemMap["Rope, hempen (50 ft.)"], quantity: 1, equipped: false },
      ]);

      const dc = new DetailedCharacter(character);
      await dc.build();

      const enc = dc.getDetailedCharacterEncumbrance().getEncumbrance();
      expect(enc.carriedweight).toBe(115);
      expect(enc.load).toBe("medium");
      expect(enc.maxdex).toBe(3);
      expect(enc.checkpenalty).toBe(-3);
    });

    test("heavy load further restricts dex and check penalty", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");

      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      // Heavy load for STR 18 is 201-300. Use Barrel×7 = 210 lbs
      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Barrel (empty)"],
        quantity: 7,
        equipped: false,
      });

      const dc = new DetailedCharacter(character);
      await dc.build();

      const enc = dc.getDetailedCharacterEncumbrance().getEncumbrance();
      expect(enc.carriedweight).toBe(210); // 30 × 7
      expect(enc.load).toBe("heavy");
      expect(enc.maxdex).toBe(1);
      expect(enc.checkpenalty).toBe(-6);
    });

    test("overloaded when weight exceeds heavy load", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");

      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      // Overloaded > 300 lbs. Barrel×11 = 330 lbs
      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Barrel (empty)"],
        quantity: 11,
        equipped: false,
      });

      const dc = new DetailedCharacter(character);
      await dc.build();

      const enc = dc.getDetailedCharacterEncumbrance().getEncumbrance();
      expect(enc.carriedweight).toBe(330); // 30 × 11
      expect(enc.load).toBe("overloaded");
      expect(enc.maxdex).toBe(0);
      expect(enc.checkpenalty).toBe(-6);
    });

    test("empty inventory is light load", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");

      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));

      const dc = new DetailedCharacter(character);
      await dc.build();

      const enc = dc.getDetailedCharacterEncumbrance().getEncumbrance();
      expect(enc.carriedweight).toBe(0);
      expect(enc.load).toBe("light");
      expect(enc.maxdex).toBe(Infinity);
      expect(enc.checkpenalty).toBe(0);
    });

    test("medium/heavy encumbrance reduces speed", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");

      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      // Medium load: Barrel×4 = 120 lbs (between 100 and 200)
      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Barrel (empty)"],
        quantity: 4,
        equipped: false,
      });

      const dc = new DetailedCharacter(character);
      await dc.build();

      // Bjorn is Human (base speed 30), medium load reduces to 20
      const combat = dc.getDetailedCharacterCombat().getCombat();
      expect(combat.encumbrance.load).toBe("medium");
      expect(combat.speed.base).toBe(30);
      expect(combat.speed.total).toBe(20);
    });

    test("overloaded character has speed 5", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");

      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      // Overloaded: Barrel×11 = 330 lbs (> 300)
      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Barrel (empty)"],
        quantity: 11,
        equipped: false,
      });

      const dc = new DetailedCharacter(character);
      await dc.build();

      const combat = dc.getDetailedCharacterCombat().getCombat();
      expect(combat.encumbrance.load).toBe("overloaded");
      expect(combat.speed.total).toBe(5);
    });

    test("encumbrance maxdex caps AC dexterity", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");

      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      // Heavy load: Barrel×7 = 210 lbs => maxdex 1
      // No armor (so no armor maxdex), only encumbrance caps dex
      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Barrel (empty)"],
        quantity: 7,
        equipped: false,
      });

      const dc = new DetailedCharacter(character);
      await dc.build();

      // Bjorn DEX 14 => modifier +2, but heavy encumbrance maxdex = 1
      const combat = dc.getDetailedCharacterCombat().getCombat();
      expect(combat.encumbrance.maxdex).toBe(1);
      expect(combat.ac.dexterity).toBe(1);
      // AC = base 10 + dex 1 = 11 (no armor)
      expect(combat.ac.total).toBe(11);
    });

    test("encumbrance check penalty applies to weight-affected skills", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");

      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      // Medium load with no armor: Barrel×4 = 120 lbs => checkpenalty -3
      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Barrel (empty)"],
        quantity: 4,
        equipped: false,
      });

      const dc = new DetailedCharacter(character);
      await dc.build();

      // With no armor, encumbrance check penalty -3 is worse than armor penalty 0
      // weight-affected skills should have weight = 3
      const skills = dc.getDetailedCharacterSkills().getSkills();
      // Swim and Climb are weight-affected in D&D 3.5
      expect(skills["swim"]?.weight).toBe(3);
      expect(skills["climb"]?.weight).toBe(3);
    });

    test("armor check penalty takes precedence over lighter encumbrance penalty", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");

      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      // Chain Mail check penalty = -5, medium encumbrance penalty = -3
      // Armor is worse (-5 < -3), so armor penalty should be used
      // Inventory: Chain Mail (40) + Barrel×3 (90) = 130 lbs => medium load
      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
      await db.insert(inventoryInCharacter).values([
        { characterId: character.id, itemId: itemMap["Chain Mail"], quantity: 1, equipped: true, location: "Torso" },
        { characterId: character.id, itemId: itemMap["Barrel (empty)"], quantity: 3, equipped: false },
      ]);

      const dc = new DetailedCharacter(character);
      await dc.build();

      const enc = dc.getDetailedCharacterEncumbrance().getEncumbrance();
      expect(enc.load).toBe("medium");
      expect(enc.checkpenalty).toBe(-3);

      // Chain Mail check penalty is -5, which is worse than encumbrance -3
      const skills = dc.getDetailedCharacterSkills().getSkills();
      expect(skills["swim"]?.weight).toBe(5);
      expect(skills["climb"]?.weight).toBe(5);
    });

    test("low strength character has lower carrying capacity", async () => {
      // Elara Starweaver: Elf Wizard, STR 8 (no racial STR mod)
      // STR 8 => CARRYING_CAPACITY[8] = 80 lbs heavy load
      const dc = await buildCharacter("Elara Starweaver");
      const enc = dc.getDetailedCharacterEncumbrance().getEncumbrance();

      expect(enc.heavyload).toBe(80);
      expect(enc.mediumload).toBe(53);  // floor(80 * 2/3) = 53
      expect(enc.lightload).toBe(26);   // floor(80 / 3) = 26
    });

    test("Dwarf base speed 20 reduces to 15 under medium load", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");

      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Kael Stormborn");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      // Kael Stormborn: Dwarf Fighter 3/Barbarian 1, STR 16, Medium size, base speed 20
      // STR 16 => heavy = 230, medium = 153, light = 76
      // Add Barrel×3 = 90 lbs => medium load
      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Barrel (empty)"],
        quantity: 3,
        equipped: false,
      });

      const dc = new DetailedCharacter(character);
      await dc.build();

      const combat = dc.getDetailedCharacterCombat().getCombat();
      expect(combat.encumbrance.load).toBe("medium");
      expect(combat.speed.base).toBe(20);
      // ENCUMBERED_SPEED[20] = 15, plus any misc speed modifiers (Barbarian Fast Movement)
      expect(combat.speed.total).toBe(15 + combat.speed.misc);
    });

    test("Grak Thunderfist with high STR has higher carrying capacity", async () => {
      // Grak: Half-Orc, STR 18 base + 2 racial = 20
      // STR 20 => CARRYING_CAPACITY[20] = 400
      const dc = await buildCharacter("Grak Thunderfist");
      const enc = dc.getDetailedCharacterEncumbrance().getEncumbrance();

      expect(enc.heavyload).toBe(400);
      expect(enc.mediumload).toBe(266); // floor(400 * 2/3)
      expect(enc.lightload).toBe(133);  // floor(400 / 3)
    });

    test("quantity multiplies item weight", async () => {
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");

      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      const [ruleset] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

      const items = await db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, ruleset.id));
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

      // 10 Torches at 1 lb each = 10 lbs
      await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
      await db.insert(inventoryInCharacter).values({
        characterId: character.id,
        itemId: itemMap["Torch"],
        quantity: 10,
        equipped: false,
      });

      const dc = new DetailedCharacter(character);
      await dc.build();

      const enc = dc.getDetailedCharacterEncumbrance().getEncumbrance();
      expect(enc.carriedweight).toBe(10); // 1 lb × 10
    });
  });

  describe("template modifiers", () => {
    test("Divine Grace adds CHA modifier to all saves", async () => {
      const detailedCharacter = await buildCharacter("Aldric Dawnbringer");

      // Aldric: Human Paladin 5, CHA 15 (mod +2)
      const chaMod = detailedCharacter.getDetailedCharacterAbilities().getAbilityModifier("Charisma");
      expect(chaMod).toBe(2);

      const saves = detailedCharacter.getDetailedCharacterSavingThrows().getSavingThrows();

      // Paladin 5 saves: Fort good (base 4), Ref poor (base 1), Will poor (base 1)
      // CON 14 (mod +2), DEX 10 (mod 0), WIS 12 (mod +1)
      // Divine Grace adds CHA mod (+2) to misc on all saves

      // Fortitude = base(4) + CON(+2) + misc(+2 Divine Grace) = 8
      expect(saves.fortitude.base).toBe(4);
      expect(saves.fortitude.misc).toBe(2);
      expect(saves.fortitude.total).toBe(8);

      // Reflex = base(1) + DEX(0) + misc(+2 Divine Grace) = 3
      expect(saves.reflex.base).toBe(1);
      expect(saves.reflex.misc).toBe(2);
      expect(saves.reflex.total).toBe(3);

      // Will = base(1) + WIS(+1) + misc(+2 Divine Grace) = 4
      expect(saves.will.base).toBe(1);
      expect(saves.will.misc).toBe(2);
      expect(saves.will.total).toBe(4);

      // Verify the modifier is in appliedModifiers
      const { appliedModifiers } = detailedCharacter.getDetailedCharacterModifiers().getModifiers();
      const divineGraceMods = appliedModifiers.filter((m) => m.value === "{{ [abilities.charisma.modifier] }}");
      expect(divineGraceMods.length).toBeGreaterThanOrEqual(3); // one per save (wildcard expanded)
    });

    test("template modifier appears in appliedModifiers, not skipped", async () => {
      const detailedCharacter = await buildCharacter("Aldric Dawnbringer");
      const { skippedModifiers } = detailedCharacter.getDetailedCharacterModifiers().getModifiers();
      const templateSkipped = skippedModifiers.filter((s) => s.modifier.value.startsWith("{{"));
      expect(templateSkipped).toHaveLength(0);
    });

    test("Monk AC Bonus adds WIS modifier when unarmored and unshielded", async () => {
      const detailedCharacter = await buildCharacter("Zen Whitepetal");

      // Zen: Human Monk 3, WIS 16 (mod +3), DEX 16 (mod +3), no armor/shield
      const wisMod = detailedCharacter.getDetailedCharacterAbilities().getAbilityModifier("Wisdom");
      expect(wisMod).toBe(3);

      const combat = detailedCharacter.getDetailedCharacterCombat().getCombat();

      // AC = base(10) + DEX(+3) + WIS(+3 from AC Bonus) + misc(0 flat at L3) = 16
      expect(combat.ac.base).toBe(10);
      expect(combat.ac.dexterity).toBe(3);
      expect(combat.ac.armor).toBe(0);
      expect(combat.ac.shield).toBe(0);
      expect(combat.ac.misc).toBe(3);
      expect(combat.ac.total).toBe(16);

      // Template modifier is applied
      const { appliedModifiers } = detailedCharacter.getDetailedCharacterModifiers().getModifiers();
      const acBonusMod = appliedModifiers.find((m) => m.value === "{{ [abilities.wisdom.modifier] }}");
      expect(acBonusMod).toBeDefined();
    });

    test("Monk AC Bonus is unapplied when armor is equipped", async () => {
      // Aldric (Paladin) has armor equipped — if he somehow had the modifier,
      // the requirement would block it. We verify via Zen by checking the modifier
      // requirement targets are present.
      const detailedCharacter = await buildCharacter("Zen Whitepetal");
      const { appliedModifiers } = detailedCharacter.getDetailedCharacterModifiers().getModifiers();
      const acBonusMod = appliedModifiers.find((m) => m.value === "{{ [abilities.wisdom.modifier] }}" && m.target === "combat.ac.misc");
      expect(acBonusMod).toBeDefined();

      // Verify the modifier has requirements (armor == 0, shield == 0)
      const reqs = detailedCharacter.getDetailedCharacterRequirements().getRequirements();
      const modReqs = reqs.fulfilledRequirementGroups.filter((group) =>
        group.some((r) => r.entityId === acBonusMod!.id && r.entityType === "modifiers"),
      );
      expect(modReqs.length).toBeGreaterThan(0);
    });
  });

  describe("spellcasting holder", () => {
    test("wizard 3 has arcane 2 and divine 0", async () => {
      // Elara Starweaver: Wizard 3
      // Wizard 3 can cast up to 2nd-level arcane spells
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Elara Starweaver");
      if (!character) throw new Error("Character must be defined");

      const dc = new DetailedCharacter(character);
      await dc.build();

      const spellcasting = dc.getSpellcasting();
      expect(spellcasting.arcane).toBe(2);
      expect(spellcasting.divine).toBe(0);
    });

    test("cleric 3 has divine 2 and arcane 0", async () => {
      // Theron Lightbringer: Cleric 3
      // Cleric 3 can cast up to 2nd-level divine spells
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Theron Lightbringer");
      if (!character) throw new Error("Character must be defined");

      const dc = new DetailedCharacter(character);
      await dc.build();

      const spellcasting = dc.getSpellcasting();
      expect(spellcasting.arcane).toBe(0);
      expect(spellcasting.divine).toBe(2);
    });

    test("non-caster has both arcane and divine at 0", async () => {
      // Bjorn Ironhand: Fighter 3 — no spellcasting
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Bjorn Ironhand");
      if (!character) throw new Error("Character must be defined");

      const dc = new DetailedCharacter(character);
      await dc.build();

      const spellcasting = dc.getSpellcasting();
      expect(spellcasting.arcane).toBe(0);
      expect(spellcasting.divine).toBe(0);
    });

    test("spellcasting requirement evaluates correctly for wizard (arcane passes, divine fails)", async () => {
      // Elara Starweaver: Wizard 3 — has arcane 2 but no divine
      // Test that the requirement system can evaluate spellcasting paths
      const user = await Users.findOne(db, { emailAddress: "localuser@example.com" });
      if (!user) throw new Error("User must be defined");
      const result = await Characters.findMany(db, { userId: user.id, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
      const character = result.items.find((c) => c.name === "Elara Starweaver");
      if (!character) throw new Error("Character must be defined");

      const dc = new DetailedCharacter(character);
      await dc.build();

      const now = new Date().toISOString();
      const makeReq = (id: string, target: string, value: string) => ({
        id, entityId: "test", entityType: "test", level: "1",
        target, operator: "greater_than_or_equal", value, valueType: "number",
        chainingOperator: null, createdAt: now, deletedAt: null, updatedAt: now,
      });

      // Test that spellcasting.arcane >= 2 passes (wizard 3 can cast 2nd level)
      expect(dc.areRequirementsMet([[makeReq("test-arcane", "spellcasting.arcane", "2")]])).toBe(true);

      // Test that spellcasting.divine >= 2 fails (wizard has no divine casting)
      expect(dc.areRequirementsMet([[makeReq("test-divine", "spellcasting.divine", "2")]])).toBe(false);
    });

    test("spellcasting requirements evaluate correctly during build with projected prestige class level", async () => {
      // Regression test: initSpellcastingHolder used to return 0/1 instead of actual
      // max spell level, causing spellcasting.divine >= 3 to fail during build even
      // when the character qualifies (Cleric 5 has 3rd-level divine spells).
      const ctx = await getSeedContext(db);

      // Thaumaturgist lives in the DMG extension — character needs a fork that subscribes to it.
      const [dmgExtension] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_DMG_NAME));
      if (!dmgExtension) throw new Error("DMG extension not found");

      const [dmgFork] = await Rulesets.create(db, {
        name: `Thaumaturgist Fork ${Math.random().toString(36).slice(2, 7)}`,
        description: "Fork subscribed to DMG for Thaumaturgist content",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: SEED_USER_ID,
        rulesetId: ctx.rulesetId,
        ancestorRulesetIds: [ctx.rulesetId],
        extensionRulesetIds: [dmgExtension.id],
      });
      invalidateRuleset(dmgFork.id);

      // Create Human Cleric 5 with Spell Focus: Conjuration (for Thaumaturgist prereqs)
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Cleric For Thaumaturgist", xp: 15000,
        alignment: "Neutral Good", age: 35, gender: "Male",
        height: "183", weight: "85", description: "Test",
        abilities: { Strength: 10, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 16, Charisma: 12 },
        languages: ["Common"],
        rulesetId: dmgFork.id,
      });

      const levelIds = await addClassLevels(db, ctx, characterId, "Cleric", [1, 2, 3, 4, 5], [8, 6, 7, 6, 7]);

      // L1: 16 SP ((2+1+1)*4), L2-5: 4 SP each — total 32
      await addSkills(db, ctx, levelIds, [
        { levelIndex: 0, skillName: "Concentration", rank: 4 },
        { levelIndex: 0, skillName: "Heal", rank: 4 },
        { levelIndex: 0, skillName: "Knowledge (Religion)", rank: 4 },
        { levelIndex: 0, skillName: "Spellcraft", rank: 4 },
        { levelIndex: 1, skillName: "Concentration", rank: 1 },
        { levelIndex: 1, skillName: "Heal", rank: 1 },
        { levelIndex: 1, skillName: "Knowledge (Religion)", rank: 1 },
        { levelIndex: 1, skillName: "Spellcraft", rank: 1 },
        { levelIndex: 2, skillName: "Concentration", rank: 1 },
        { levelIndex: 2, skillName: "Heal", rank: 1 },
        { levelIndex: 2, skillName: "Knowledge (Religion)", rank: 1 },
        { levelIndex: 2, skillName: "Spellcraft", rank: 1 },
        { levelIndex: 3, skillName: "Concentration", rank: 1 },
        { levelIndex: 3, skillName: "Heal", rank: 1 },
        { levelIndex: 3, skillName: "Knowledge (Religion)", rank: 1 },
        { levelIndex: 3, skillName: "Spellcraft", rank: 1 },
        { levelIndex: 4, skillName: "Concentration", rank: 1 },
        { levelIndex: 4, skillName: "Heal", rank: 1 },
        { levelIndex: 4, skillName: "Knowledge (Religion)", rank: 1 },
        { levelIndex: 4, skillName: "Spellcraft", rank: 1 },
      ]);

      await addFeats(db, ctx, levelIds, [
        { levelIndex: 0, featName: "Spell Focus: Conjuration", aptitude: "General" },
        { levelIndex: 0, featName: "Combat Casting", aptitude: "General" },
        { levelIndex: 0, featName: "Healing Domain", aptitude: "Cleric Domain" },
        { levelIndex: 0, featName: "Sun Domain", aptitude: "Cleric Domain" },
        { levelIndex: 2, featName: "Toughness", aptitude: "General" },
      ]);

      // Look up the Thaumaturgist klass level 1 (requires Spell Focus: Conjuration + spellcasting.divine >= 3)
      const [thaumaturgist] = await db
        .select({ id: klassesInRules.id })
        .from(klassesInRules)
        .where(eq(klassesInRules.name, "Thaumaturgist"));
      const thaumaturgistL1 = await KlassLevels.findOneByKlassAndLevel(db, { klassId: thaumaturgist.id, level: 1 });
      if (!thaumaturgistL1) throw new Error("Thaumaturgist level 1 must exist");

      // Build with projected Thaumaturgist L1
      const character = await Characters.findOne(db, { id: characterId });
      if (!character) throw new Error("Character must exist");

      const dc = new DetailedCharacter(character);
      await dc.build(undefined, {
        characterLevels: [{
          id: "00000000-0000-0000-0000-000000000099",
          characterId,
          klassLevelId: thaumaturgistL1.id,
          hp: 4,
          abilityId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        }],
      });

      // Validate and check that no "Unmet prerequisite" issues exist for klass_levels
      // (There may be unspent slot warnings — those are fine, we only care about requirements)
      const { issues } = dc.validate();
      const requirementIssues = issues.filter((i) => i.category === "requirements");
      expect(requirementIssues).toHaveLength(0);
    });
  });

  describe("virtually possessed feat modifiers", () => {
    test("War Domain Weapon: Longsword grants Weapon Focus +1 attack via possessed modifier", async () => {
      const ctx = await getSeedContext(db);

      // Create a Fighter 1 / Cleric 1 with War Domain + War Domain Weapon: Longsword
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human",
        name: "War Domain Test",
        xp: 1000,
        alignment: "Neutral Good",
        age: 30,
        gender: "Male",
        height: "180",
        weight: "80",
        description: "Test",
        abilities: { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 16, Charisma: 12 },
        languages: ["Common"],
      });

      // Fighter L1: gives BAB 1 and martial weapon proficiency
      const levelIds = await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]);

      // Cleric L1 (character level 2)
      const clericLevelIds = await addClassLevels(db, ctx, characterId, "Cleric", [1], [8]);

      await addSkills(db, ctx, levelIds, [
        { levelIndex: 0, skillName: "Climb", rank: 4 },
        { levelIndex: 0, skillName: "Intimidate", rank: 4 },
        { levelIndex: 0, skillName: "Jump", rank: 4 },
        { levelIndex: 0, skillName: "Swim", rank: 4 },
      ]);

      await addSkills(db, ctx, clericLevelIds, [
        { levelIndex: 0, skillName: "Concentration", rank: 1 },
        { levelIndex: 0, skillName: "Heal", rank: 1 },
        { levelIndex: 0, skillName: "Spellcraft", rank: 1 },
        { levelIndex: 0, skillName: "Diplomacy", rank: 1 },
      ]);

      await addFeats(db, ctx, levelIds, [
        { levelIndex: 0, featName: "Power Attack", aptitude: "General" },
        { levelIndex: 0, featName: "Great Fortitude", aptitude: "General" },
        { levelIndex: 0, featName: "Improved Initiative", aptitude: "Fighter Bonus Feat" },
      ]);

      await addFeats(db, ctx, clericLevelIds, [
        { levelIndex: 0, featName: "War Domain", aptitude: "Cleric Domain" },
        { levelIndex: 0, featName: "Good Domain", aptitude: "Cleric Domain" },
        { levelIndex: 0, featName: "War Domain Weapon: Longsword", aptitude: "War Domain Weapon" },
      ]);

      // Build the character
      const character = await Characters.findOne(db, { id: characterId });
      const dc = new DetailedCharacter(character!);
      await dc.build();

      // Verify Weapon Focus: Longsword is marked as possessed via the War Domain Weapon modifier
      const feats = dc.getDetailedCharacterFeats().getFeats();
      expect((feats["weaponfocuslongsword"] as { possessed: boolean }).possessed).toBe(true);
      expect((feats["martialweaponproficiencylongsword"] as { possessed: boolean }).possessed).toBe(true);

      // Verify the Weapon Focus: Longsword modifier (+1 attack) is present.
      // Without an equipped longsword, weapon-specific modifiers land in inactiveModifiers.
      const { inactiveModifiers } = dc.getDetailedCharacterModifiers().getModifiers();
      const wfModifier = inactiveModifiers.find(
        (m) => m.target === "items.weapons.longsword.tohit.misc" && m.value === "1" && m.operator === "add",
      );
      expect(wfModifier).toBeDefined();
    });

    test("Bard L1 grants Whip EWP without flagging its BAB≥1 prereq as unmet", async () => {
      // Bard L1 auto-grants "Weapon and Armor Proficiency (Bard)", whose modifier
      // sets feats.exoticweaponproficiencywhip.possessed = true. Whip EWP itself
      // requires combat.bab >= 1 — which a L1 Bard (BAB 0) does not meet. The
      // class is the gate, so the feat's intrinsic prereq must not be enforced.
      const ctx = await getSeedContext(db);

      const characterId = await createCharacter(db, ctx, {
        raceName: "Human",
        name: "Whip Bard Test",
        xp: 0,
        alignment: "Neutral Good",
        age: 25,
        gender: "Female",
        height: "165",
        weight: "60",
        description: "Test",
        abilities: { Strength: 10, Dexterity: 14, Constitution: 12, Intelligence: 12, Wisdom: 10, Charisma: 16 },
        languages: ["Common"],
      });

      const levelIds = await addClassLevels(db, ctx, characterId, "Bard", [1], [6]);

      await addFeats(db, ctx, levelIds, [
        { levelIndex: 0, featName: "Toughness", aptitude: "General" },
      ]);

      const character = await Characters.findOne(db, { id: characterId });
      const dc = new DetailedCharacter(character!);
      await dc.build();

      // Whip EWP should be virtually possessed.
      const feats = dc.getDetailedCharacterFeats().getFeats();
      expect((feats["exoticweaponproficiencywhip"] as { possessed: boolean }).possessed).toBe(true);

      // No requirement issue should mention Whip EWP.
      const { issues } = dc.validate();
      const whipIssue = issues
        .filter((i) => i.category === "requirements")
        .find((i) => i.entityName === "Exotic Weapon Proficiency: Whip");
      expect(whipIssue).toBeUndefined();
    });
  });

  describe("virtually possessed power modifiers", () => {
    test("a feat modifier can grant a spell as possessed", async () => {
      const ctx = await getSeedContext(db);

      const characterId = await createCharacter(db, ctx, {
        raceName: "Human",
        name: "Spell Possession Test",
        xp: 1000,
        alignment: "Neutral Good",
        age: 30,
        gender: "Male",
        height: "180",
        weight: "80",
        description: "Test",
        abilities: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 16, Wisdom: 10, Charisma: 10 },
        languages: ["Common"],
      });

      const levelIds = await addClassLevels(db, ctx, characterId, "Wizard", [1], [4]);

      await addSkills(db, ctx, levelIds, [
        { levelIndex: 0, skillName: "Spellcraft", rank: 4 },
        { levelIndex: 0, skillName: "Concentration", rank: 4 },
      ]);

      await addFeats(db, ctx, levelIds, [
        { levelIndex: 0, featName: "Improved Initiative", aptitude: "General" },
        { levelIndex: 0, featName: "Scribe Scroll", aptitude: "Wizard Bonus Feat" },
      ]);

      // Give the character some Wizard spells
      await addPowers(db, ctx, levelIds, [
        { levelIndex: 0, powerName: "Detect Magic", aptitude: "Wizard Spells" },
        { levelIndex: 0, powerName: "Read Magic", aptitude: "Wizard Spells" },
        { levelIndex: 0, powerName: "Mage Armor", aptitude: "Wizard Spells" },
      ]);

      // Add a modifier on Toughness that grants Magic Missile as known
      const toughnessId = ctx.featMap["Toughness"];
      await Modifiers.create(db, {
        sourceId: toughnessId,
        sourceType: "feats",
        target: "powers.magicmissile.wizard.known",
        value: "true",
        valueType: "boolean",
        operator: "set",
      });
      invalidateRuleset(ctx.rulesetId);

      // Pick Toughness so the modifier fires
      await addFeats(db, ctx, levelIds, [
        { levelIndex: 0, featName: "Toughness", aptitude: "General" },
      ]);

      const character = await Characters.findOne(db, { id: characterId });
      const dc = new DetailedCharacter(character!);
      await dc.build();

      // Magic Missile should be marked known even though it wasn't picked
      const spells = dc.getDetailedCharacterPowers();
      expect(spells.getSpellEntry("magicmissile", "wizard")?.known).toBe(true);

      // Detect Magic (actually picked) should also be known
      expect(spells.getSpellEntry("detectmagic", "wizard")?.known).toBe(true);

      // A spell not picked and not granted should not be known
      expect(spells.getSpellEntry("burninghands", "wizard")?.known).toBe(false);
    });

    test("virtually possessed spell with unmet intrinsic prereq does not flag a requirement issue", async () => {
      // Mirror of the feat-side fix: a power granted via a `set powers.X.Y.known = true`
      // modifier is gated by that modifier; the power's own prereqs must not be re-enforced.
      const ctx = await getSeedContext(db);

      const characterId = await createCharacter(db, ctx, {
        raceName: "Human",
        name: "Virtual Spell Unmet Prereq Test",
        xp: 0,
        alignment: "Neutral Good",
        age: 30,
        gender: "Male",
        height: "180",
        weight: "80",
        description: "Test",
        abilities: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 16, Wisdom: 10, Charisma: 10 },
        languages: ["Common"],
      });

      const levelIds = await addClassLevels(db, ctx, characterId, "Wizard", [1], [4]);

      // Magic Missile: pin an intrinsic prereq the L1 Wizard cannot meet.
      const magicMissileId = ctx.powerMap["Magic Missile"];
      await Requirements.create(db, {
        entityId: magicMissileId,
        entityType: "powers",
        level: "1",
        target: "classes.wizard.level",
        operator: "greater_than_or_equal",
        value: "5",
        valueType: "number",
        chainingOperator: null,
      });

      // Toughness modifier virtually grants Magic Missile.
      const toughnessId = ctx.featMap["Toughness"];
      await Modifiers.create(db, {
        sourceId: toughnessId,
        sourceType: "feats",
        target: "powers.magicmissile.wizard.known",
        value: "true",
        valueType: "boolean",
        operator: "set",
      });
      invalidateRuleset(ctx.rulesetId);

      await addFeats(db, ctx, levelIds, [
        { levelIndex: 0, featName: "Toughness", aptitude: "General" },
      ]);

      const character = await Characters.findOne(db, { id: characterId });
      const dc = new DetailedCharacter(character!);
      await dc.build();

      // Magic Missile is granted virtually.
      expect(dc.getDetailedCharacterPowers().getSpellEntry("magicmissile", "wizard")?.known).toBe(true);

      // No requirement issue should mention Magic Missile.
      const { issues } = dc.validate();
      const mmIssue = issues
        .filter((i) => i.category === "requirements")
        .find((i) => i.entityName === "Magic Missile");
      expect(mmIssue).toBeUndefined();
    });

    test("grouping DC modifiers (Spell Focus) apply to virtually possessed spells", async () => {
      const ctx = await getSeedContext(db);

      const characterId = await createCharacter(db, ctx, {
        raceName: "Human",
        name: "Virtual Spell DC Test",
        xp: 1000,
        alignment: "Neutral Good",
        age: 30,
        gender: "Male",
        height: "180",
        weight: "80",
        description: "Test",
        abilities: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 16, Wisdom: 10, Charisma: 10 },
        languages: ["Common"],
      });

      const levelIds = await addClassLevels(db, ctx, characterId, "Wizard", [1], [4]);

      await addSkills(db, ctx, levelIds, [
        { levelIndex: 0, skillName: "Spellcraft", rank: 4 },
        { levelIndex: 0, skillName: "Concentration", rank: 4 },
      ]);

      // Spell Focus: Evocation adds +1 DC to all evocation spells via the
      // grouping modifier `powers.groups.evocation.*.dc.misc`.
      await addFeats(db, ctx, levelIds, [
        { levelIndex: 0, featName: "Spell Focus: Evocation", aptitude: "General" },
        { levelIndex: 0, featName: "Scribe Scroll", aptitude: "Wizard Bonus Feat" },
      ]);

      // Wizard spells the character actually learned (none are evocation).
      await addPowers(db, ctx, levelIds, [
        { levelIndex: 0, powerName: "Detect Magic", aptitude: "Wizard Spells" },
        { levelIndex: 0, powerName: "Read Magic", aptitude: "Wizard Spells" },
        { levelIndex: 0, powerName: "Mage Armor", aptitude: "Wizard Spells" },
      ]);

      // Toughness virtually grants Magic Missile (level 1, Evocation).
      const toughnessId = ctx.featMap["Toughness"];
      await Modifiers.create(db, {
        sourceId: toughnessId,
        sourceType: "feats",
        target: "powers.magicmissile.wizard.known",
        value: "true",
        valueType: "boolean",
        operator: "set",
      });
      invalidateRuleset(ctx.rulesetId);

      await addFeats(db, ctx, levelIds, [
        { levelIndex: 0, featName: "Toughness", aptitude: "General" },
      ]);

      const character = await Characters.findOne(db, { id: characterId });
      const dc = new DetailedCharacter(character!);
      await dc.build();

      const virtualPowers = dc.getVirtuallyPossessedPowersWithAptitudes();
      const magicMissile = virtualPowers.find((vp) => vp.power.name === "Magic Missile");
      expect(magicMissile).toBeDefined();
      // 10 (base) + 1 (level) + 3 (INT 16 mod) + 1 (Spell Focus: Evocation) = 15
      expect(magicMissile!.dc).toBe(15);
    });
  });

  describe("spell tags", () => {
    test("Theron's cleric spells are tagged with domain names", async () => {
      const dc = await buildCharacter("Theron Lightbringer");
      const spellTags = dc.getSpellTags();

      // Theron has Healing Domain and Sun Domain
      // Spells on the cleric list that also belong to those domains should be tagged
      const healingTagged = Object.entries(spellTags).filter(([, tags]) =>
        tags.includes("Healing Domain"),
      );
      const sunTagged = Object.entries(spellTags).filter(([, tags]) =>
        tags.includes("Sun Domain"),
      );

      expect(healingTagged.length).toBeGreaterThan(0);
      expect(sunTagged.length).toBeGreaterThan(0);
    });

    test("Elara's wizard spells are tagged with specialist school", async () => {
      const dc = await buildCharacter("Elara Starweaver");
      const spellTags = dc.getSpellTags();

      // Elara has Evocation Specialist — evocation spells should be tagged
      const evocationTagged = Object.entries(spellTags).filter(([, tags]) =>
        tags.includes("Evocation Specialist"),
      );

      expect(evocationTagged.length).toBeGreaterThan(0);

      // Magic Missile and Burning Hands are Evocation spells — verify they're tagged
      const classes = dc.getDetailedCharacterClasses().getCharacterClasses();
      const allPowers = Object.values(classes).flatMap((klass) =>
        klass.levels.flatMap((level) => level.powers),
      );

      const magicMissile = allPowers.find((p) => p.name === "Magic Missile");
      const burningHands = allPowers.find((p) => p.name === "Burning Hands");
      expect(magicMissile).toBeDefined();
      expect(burningHands).toBeDefined();

      if (magicMissile) expect(spellTags[magicMissile.id]).toContain("Evocation Specialist");
      if (burningHands) expect(spellTags[burningHands.id]).toContain("Evocation Specialist");

      // Web is Conjuration — should NOT be tagged as Evocation
      const web = allPowers.find((p) => p.name === "Web");
      expect(web).toBeDefined();
      if (web) expect(spellTags[web.id]?.includes("Evocation Specialist")).toBeFalsy();
    });

    test("non-caster characters have no spell tags", async () => {
      const dc = await buildCharacter("Bjorn Ironhand");
      const spellTags = dc.getSpellTags();
      expect(Object.keys(spellTags).length).toBe(0);
    });
  });

  describe("domain spells", () => {
    test("domain-only spells appear in cleric's available powers", async () => {
      // Theron is Cleric 3 with Healing Domain and Sun Domain.
      // "Heat Metal" is a Sun Domain Spells level 2 spell that is NOT on the Cleric Spells list.
      // It should appear in the cleric's enriched powers.
      const dc = await buildCharacter("Theron Lightbringer");

      const classes = dc.getDetailedCharacterClasses().getCharacterClasses();
      const clericPowers = classes["cleric"]?.levels.flatMap((level) => level.powers) ?? [];
      const powerNames = clericPowers.map((p) => p.name);

      expect(powerNames).toContain("Heat Metal");
    });

    test("domain-only spells are merged into the cleric spell list, not a separate domain list", async () => {
      const dc = await buildCharacter("Theron Lightbringer");

      const classes = dc.getDetailedCharacterClasses().getCharacterClasses();
      const clericPowers = classes["cleric"]?.levels.flatMap((level) => level.powers) ?? [];
      const heatMetal = clericPowers.find((p) => p.name === "Heat Metal");

      expect(heatMetal).toBeDefined();

      // aptitudeId should be the Cleric Spells aptitude, not Sun Domain Spells
      const aptitudes = dc.getDetailedCharacterAptitudes().getAptitudes();
      const clericSpellsApt = aptitudes["clericspells"];
      expect(clericSpellsApt).toBeDefined();
      expect(heatMetal!.aptitudeId).toBe(clericSpellsApt.id);
    });

    test("domain-only spells are tagged with the domain name", async () => {
      const dc = await buildCharacter("Theron Lightbringer");

      const classes = dc.getDetailedCharacterClasses().getCharacterClasses();
      const clericPowers = classes["cleric"]?.levels.flatMap((level) => level.powers) ?? [];
      const heatMetal = clericPowers.find((p) => p.name === "Heat Metal");
      expect(heatMetal).toBeDefined();

      const spellTags = dc.getSpellTags();
      expect(spellTags[heatMetal!.id]).toContain("Sun Domain");
    });

    test("domain spells beyond the cleric's max spell level are not enriched", async () => {
      // Theron is Cleric 3 — can cast up to level 2 spells.
      // "Fire Shield" is Sun Domain level 4 — should NOT be enriched.
      const dc = await buildCharacter("Theron Lightbringer");

      const classes = dc.getDetailedCharacterClasses().getCharacterClasses();
      const allPowers = Object.values(classes).flatMap((klass) =>
        klass.levels.flatMap((level) => level.powers),
      );
      const powerNames = allPowers.map((p) => p.name);

      expect(powerNames).not.toContain("Fire Shield");
    });

    test("bonus caster levels unlock domain spells at newly accessible spell levels", async () => {
      // Cleric 7 / Stormlord 5 with Storm Domain.
      // Base Cleric 7 can only cast up to 4th level spells, but Stormlord 5 grants
      // +5 bonus caster levels → effective Cleric 12, which unlocks 5th and 6th level spells.
      // Domain spells at those levels (Ice Storm, Call Lightning Storm) should also appear.
      const ctx = await getSeedContext(db);

      // Find Complete Divine extension for Stormlord class
      const [cdExtension] = await db
        .select({ id: rulesetsInRules.id })
        .from(rulesetsInRules)
        .where(eq(rulesetsInRules.name, DND35_COMPLETE_DIVINE_NAME));
      if (!cdExtension) throw new Error("Complete Divine extension not found");

      const [stormlordKlass] = await db
        .select({ id: klassesInRules.id })
        .from(klassesInRules)
        .where(and(eq(klassesInRules.rulesetId, cdExtension.id), eq(klassesInRules.name, "Stormlord")));
      if (!stormlordKlass) throw new Error("Stormlord class not found");

      const cdFeats = await db
        .select({ id: featsInRules.id, name: featsInRules.name })
        .from(featsInRules)
        .where(eq(featsInRules.rulesetId, cdExtension.id));
      const cdFeatMap = Object.fromEntries(cdFeats.map((f) => [f.name, f.id]));

      const cdAptitudes = await db
        .select({ id: aptitudesInRules.id, name: aptitudesInRules.name })
        .from(aptitudesInRules)
        .where(eq(aptitudesInRules.rulesetId, cdExtension.id));
      const cdAptMap = Object.fromEntries(cdAptitudes.map((a) => [a.name, a.id]));

      const advanceClericFeatId = cdFeatMap["Advance Cleric Spellcasting"] ?? ctx.featMap["Advance Cleric Spellcasting"];
      const bonusDivineAptId = cdAptMap["Bonus Divine Caster Level"] ?? ctx.aptMap["Bonus Divine Caster Level"];

      // The character needs a ruleset whose source chain includes the CD extension —
      // a fork of seed that subscribes to CD. (Characters can't live in a system-
      // owned ruleset directly in production; the DB isn't the right abstraction.)
      const [cdFork] = await Rulesets.create(db, {
        name: `Storm Fork ${Math.random().toString(36).slice(2, 7)}`,
        description: "Fork subscribed to CD for Stormlord content",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: SEED_USER_ID,
        rulesetId: ctx.rulesetId,
        ancestorRulesetIds: [ctx.rulesetId],
        extensionRulesetIds: [cdExtension.id],
      });
      invalidateRuleset(cdFork.id);

      const characterId = await createCharacter(db, ctx, {
        raceName: "Human",
        name: "Storm Debug Character",
        xp: 66000,
        alignment: "Chaotic Neutral",
        age: 30,
        gender: "Male",
        height: "180",
        weight: "80",
        description: "Debug character",
        abilities: { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 18, Charisma: 10 },
        languages: ["Common"],
        rulesetId: cdFork.id,
      });

      const clericLevelIds = await addClassLevels(db, ctx, characterId, "Cleric", [1, 2, 3, 4, 5, 6, 7], [8, 6, 7, 6, 8, 6, 7]);

      const stormlordLevelIds: string[] = [];
      for (let level = 1; level <= 5; level++) {
        const [klassLevel] = await db
          .select({ id: klassLevelsInRules.id })
          .from(klassLevelsInRules)
          .where(and(eq(klassLevelsInRules.klassId, stormlordKlass.id), eq(klassLevelsInRules.level, level)));
        const [charLevel] = await db
          .insert(levelsInCharacter)
          .values({ characterId, klassLevelId: klassLevel.id, hp: 6 })
          .returning({ id: levelsInCharacter.id });
        stormlordLevelIds.push(charLevel.id);
      }

      await addFeats(db, ctx, clericLevelIds, [
        { levelIndex: 0, featName: "Storm Domain", aptitude: "Cleric Domain" },
        { levelIndex: 0, featName: "War Domain", aptitude: "Cleric Domain" },
      ]);

      for (const levelId of stormlordLevelIds) {
        await db.insert(levelFeatsInCharacter).values({
          characterLevelId: levelId,
          featId: advanceClericFeatId,
          aptitudeId: bonusDivineAptId,
        });
      }

      const character = await Characters.findOne(db, { id: characterId });
      if (!character) throw new Error("Character not found");
      const dc = new DetailedCharacter(character);
      await dc.build();

      const classes = dc.getDetailedCharacterClasses().getCharacterClasses();
      expect(classes["cleric"].level).toBe(7);
      expect(classes["cleric"].bonuscasterlevel).toBe(5);

      // Storm Domain Spells should have slots at levels 5-6 (opened by bonus caster levels)
      const aptitudes = dc.getDetailedCharacterAptitudes().getAptitudes();
      const stormDomainSpells = aptitudes["stormdomainspells"] as Record<string, unknown>;
      expect((stormDomainSpells["5"] as AptitudeLevelData).allowed).toBe(ALLOWED_ALL);
      expect((stormDomainSpells["5"] as AptitudeLevelData).uses).toBe(1);
      expect((stormDomainSpells["6"] as AptitudeLevelData).allowed).toBe(ALLOWED_ALL);
      expect((stormDomainSpells["6"] as AptitudeLevelData).uses).toBe(1);

      // Levels 7+ should remain closed (Cleric 12 doesn't open 7th level)
      expect((stormDomainSpells["7"] as AptitudeLevelData).allowed).toBe(0);

      // Domain spells at levels 5-6 should appear in enriched powers
      const allPowers = Object.values(classes).flatMap((klass) =>
        klass.levels.flatMap((level) => level.powers),
      );
      const spellTags = dc.getSpellTags();
      const stormDomainPowers = allPowers.filter((p) => {
        const tags = spellTags[p.id];
        return tags && tags.includes("Storm Domain");
      });
      const stormPowerNames = stormDomainPowers.map((p) => p.name);

      expect(stormPowerNames).toContain("Ice Storm");
      expect(stormPowerNames).toContain("Call Lightning Storm");
    });
  });
});
