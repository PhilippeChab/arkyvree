import { describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { DND35_COMPLETE_DIVINE_NAME, DND35_COMPLETE_WARRIOR_NAME, DND35_DMG_NAME, DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { seedClass } from "@/database/packages/dnd35/seed-utils.ts";
import { addClassLevels, addFeats, addPowers, addSkills, createCharacter, SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { characterAbilitiesInCharacter, charactersInCharacter, inventoryInCharacter, type location, savesInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { db } from "@/server/database/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Aptitudes, CharacterLevelFeats, CharacterLevels, Characters, Feats, Items, KlassLevels, Klasses, Modifiers, Properties, Races, Requirements, Rulesets } from "@/server/repositories/index.ts";
import DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import { ALLOWED_ALL, type AptitudeLevelData } from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import type { Character } from "@/shared/relations.ts";
import { addCharacterLevel, createTestRuleset, getSeedCtx, invalidateSeededRuleset, NIL_UUID } from "@/tests/helpers.ts";

/** A seeded character of the seed user's, by name. */
async function seeded(name: string): Promise<Character> {
  const { items } = await Characters.findMany(db, { userId: SEED_USER_ID, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
  const character = items.find((c) => c.name === name);
  if (!character) throw new Error(`Seeded character ${name} not found`);
  return character;
}

async function build(character: Character) {
  const detailed = new DetailedCharacter(character);
  await detailed.build();
  return detailed;
}

const buildSeeded = async (name: string) => build(await seeded(name));

type Carried = { item: string; location?: (typeof location.enumValues)[number]; weaponSet?: number; equipped?: boolean; quantity?: number };

/** Replaces the character's inventory: seeded items by name, or item ids. */
async function carry(character: Character, carried: Carried[]) {
  const { itemMap } = await getSeedCtx();
  await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
  if (carried.length === 0) return;
  await db.insert(inventoryInCharacter).values(carried.map(({ item, equipped = true, quantity = 1, ...rest }) => ({ characterId: character.id, itemId: itemMap[item] ?? item, equipped, quantity, ...rest })));
}

/** The seeded character, carrying only these items. */
async function buildCarrying(name: string, carried: Carried[] = []) {
  const character = await seeded(name);
  await carry(character, carried);
  return build(character);
}

/** A new item of the seeded ruleset, with these properties. */
async function createItem(values: { name: string; type: string; slot: (typeof location.enumValues)[number]; sourceItemId?: string }, properties: Record<string, string> = {}) {
  const { rulesetId } = await getSeedCtx();
  const [item] = await Items.create(db, { ...values, rulesetId });
  const entries = Object.entries(properties);
  if (entries.length > 0) await Properties.createMany(db, entries.map(([type, value]) => ({ entityId: item.id, entityType: "items", type, value })));
  invalidateSeededRuleset(rulesetId);
  return item;
}

/** The seeded character, now a halfling. */
async function asHalfling(name: string) {
  const character = await seeded(name);
  const halfling = (await Races.findOne(db, { name: "Halfling", rulesetId: character.rulesetId }))!;
  await db.update(charactersInCharacter).set({ raceId: halfling.id }).where(eq(charactersInCharacter.id, character.id));
  return { ...character, raceId: halfling.id };
}

type Detailed = Awaited<ReturnType<typeof build>>;
const weaponSet = (detailed: Detailed, set = "0") => detailed.getDetailedCharacterCombat().getCombat().weaponsets[set];
const spellLevel = (detailed: Detailed, aptitude: string, level: number) => (detailed.getDetailedCharacterAptitudes().getAptitudes()[aptitude] as Record<string, unknown>)[String(level)] as AptitudeLevelData;
const spellUses = (detailed: Detailed, aptitude: string, levels: number[]) => levels.map((level) => spellLevel(detailed, aptitude, level).uses);
const allPowers = (detailed: Detailed) => Object.values(detailed.getDetailedCharacterClasses().getCharacterClasses()).flatMap((klass) => klass.levels.flatMap((level) => level.powers));
const requirementIssues = (detailed: Detailed) => detailed.validate().issues.filter((issue) => issue.category === "requirements");

/** A fork of the seeded ruleset that uses these extensions. */
async function forkWith(...extensionNames: string[]) {
  const { rulesetId } = await getSeedCtx();
  const extensions = await Promise.all(extensionNames.map(async (name) => (await Rulesets.findOne(db, { name }))!.id));
  const fork = await createTestRuleset(SEED_USER_ID, { rulesetId, ancestorRulesetIds: [rulesetId], extensionRulesetIds: extensions });
  invalidateRuleset(fork.id);
  return fork;
}

/** A new character of the seed user's: human, neutral good, with these scores. */
async function createSeedCharacter(name: string, abilities: Record<string, number>, values: { xp?: number; rulesetId?: string; alignment?: "Neutral Good" | "Chaotic Neutral" } = {}) {
  const ctx = await getSeedCtx();
  return createCharacter(db, ctx, {
    raceName: "Human", name, xp: values.xp ?? 0, alignment: values.alignment ?? "Neutral Good", age: 30, gender: "Male",
    height: "180", weight: "80", description: "Test", abilities, languages: ["Common"], rulesetId: values.rulesetId,
  });
}

const WIZARD_SCORES = { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 16, Wisdom: 10, Charisma: 10 };

describe("DetailedCharacter", () => {
  describe("building", () => {
    test("fails without its ruleset or its race", async () => {
      const { rulesetId } = await getSeedCtx();
      const character = { name: "Test Character", userId: SEED_USER_ID, xp: 0, alignment: "True Neutral", age: 20, gender: "Male", height: "180", weight: "80" };
      await expect(new DetailedCharacter({ ...character, rulesetId: NIL_UUID, raceId: NIL_UUID } as Character).build()).rejects.toThrow("Ruleset not found");
      await expect(new DetailedCharacter({ ...character, rulesetId, raceId: NIL_UUID } as Character).build()).rejects.toThrow("Race not found");
    });

    test("reads a seeded character's identity, abilities and ruleset", async () => {
      const bjorn = await buildSeeded("Bjorn Ironhand");
      expect(bjorn.getRuleset()?.name).toBe(DND35_RULESET_NAME);
      expect(bjorn.getPlayer()).toBeUndefined();
      expect(bjorn.getCampaign()).toBeUndefined();
      expect(bjorn.getDetailedCharacterIdentity().getIdentity()).toMatchObject({ physiology: { name: "Bjorn Ironhand", race: { name: "Human" } }, beliefs: { alignment: "Lawful Good" }, meta: { xp: 10000 } });

      // No increases or misc bonuses: each total is the base score.
      const scores = { strength: 18, dexterity: 14, constitution: 16, intelligence: 12, wisdom: 10, charisma: 8 };
      const abilities = bjorn.getDetailedCharacterAbilities();
      for (const [ability, score] of Object.entries(scores)) {
        expect(abilities.getAbilities()[ability as keyof typeof scores]).toMatchObject({ base: score, level: 0, misc: 0, total: score });
        const name = ability[0].toUpperCase() + ability.slice(1);
        expect(abilities.getAbility(name).total).toBe(score);
        expect(abilities.getAbilityModifier(name)).toBe(Math.floor((score - 10) / 2));
      }
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
      const detailed = await buildSeeded(name);
      expect(detailed.getDetailedCharacterIdentity().getIdentity()).toMatchObject({ physiology: { name, race: { name: race } }, beliefs: { alignment } });
      expect(detailed.validate()).toEqual({ valid: true, issues: [] });
    });

    test("lists only the classes the character has levels in", async () => {
      const classes = (await buildSeeded("Vex Flamecaller")).getDetailedCharacterClasses();
      // getClasses holds every class of the ruleset, at level 0 when the character has none.
      expect(Object.keys(classes.getClasses()).length).toBeGreaterThan(1);
      expect(Object.entries(classes.getCharacterClasses()).map(([key, klass]) => [key, klass.level])).toEqual([["sorcerer", 3]]);
    });
  });

  describe("saving throws", () => {
    test("add the class's base, the ability and misc bonuses", async () => {
      // Fighter 5: good Fortitude 4, poor Reflex and Will 1. Great Fortitude adds 2.
      const bjorn = (await buildSeeded("Bjorn Ironhand")).getDetailedCharacterSavingThrows();
      expect(bjorn.getSavingThrows()).toMatchObject({
        fortitude: { base: 4, ability: 3, misc: 2, total: 9 },
        reflex: { base: 1, ability: 2, misc: 0, total: 3 },
        will: { base: 1, ability: 0, misc: 0, total: 1 },
      });
      expect(["Fortitude", "Reflex", "Will"].map((name) => bjorn.getSavingThrow(name).total)).toEqual([9, 3, 1]);
    });

    test("add a paladin's charisma through Divine Grace, a template modifier", async () => {
      // Paladin 5, CHA 15 (+2): good Fortitude 4, poor Reflex and Will 1.
      const aldric = await buildSeeded("Aldric Dawnbringer");
      expect(aldric.getDetailedCharacterSavingThrows().getSavingThrows()).toMatchObject({
        fortitude: { base: 4, misc: 2, total: 8 },
        reflex: { base: 1, misc: 2, total: 3 },
        will: { base: 1, misc: 2, total: 4 },
      });
      const { appliedModifiers, skippedModifiers } = aldric.getDetailedCharacterModifiers().getModifiers();
      // The wildcard over saves gives one modifier each.
      expect(appliedModifiers.filter((m) => m.value === "{{ [abilities.charisma.modifier] }}").length).toBeGreaterThanOrEqual(3);
      expect(skippedModifiers.filter((s) => s.modifier.value.startsWith("{{"))).toEqual([]);
    });
  });

  describe("hit points", () => {
    test("add each level's constitution bonus, with the race's", async () => {
      // A dwarf (CON 16 + 2): +4 at each of 4 levels, on 10 + 8 + 7 + 12 rolled; Toughness adds 3.
      const hp = (await buildSeeded("Kael Stormborn")).getDetailedCharacterCombat().getCombat().hp;
      expect(hp).toMatchObject({ base: 37, constitution: 16, misc: 3, total: 56 });
    });
  });

  describe("weapons", () => {
    test("fill the weapon sets from what the character holds, with half strength in the off hand", async () => {
      const bjorn = await buildCarrying("Bjorn Ironhand", [
        { item: "Longsword", location: "Main Hand", weaponSet: 0 },
        { item: "Shortsword", location: "Off Hand", weaponSet: 0 },
      ]);
      // STR 18: +4.
      expect(weaponSet(bjorn)).toMatchObject({
        mainhand: { name: "Longsword", damage: { base: "1d8", types: ["Slashing"], critical: { range: 2, multiplier: 2 }, strength: 4 } },
        offhand: { name: "Shortsword", damage: { base: "1d6", types: ["Piercing"], strength: 2 } },
      });
      expect(Object.keys(bjorn.getDetailedCharacterWeapons().getWeapons())).toEqual(expect.arrayContaining(["longsword", "shortsword"]));
    });

    test("give a weapon held in two hands one and a half strength", async () => {
      const bjorn = await buildCarrying("Bjorn Ironhand", [{ item: "Greataxe", location: "Two Handed", weaponSet: 1 }]);
      expect(weaponSet(bjorn, "1").twohanded).toMatchObject({ name: "Greataxe", damage: { base: "1d12", critical: { range: 1, multiplier: 3 }, strength: 6 } });
      expect(bjorn.getDetailedCharacterWeapons().getWeapons()["greataxe"]).toBeDefined();
    });

    test("group a weapon under its type, not its name", async () => {
      const variant = await createItem({ name: "Longsword +1", type: "Weapon", slot: "Main Hand" }, {
        WEAPON_PROFICIENCY: "Martial", WEAPON_FAMILY: "Sword", WEAPON_BASE_DAMAGE: "1d8", WEAPON_CRITICAL_RANGE: "2",
        WEAPON_CRITICAL_MULTIPLIER: "2", DAMAGE_TYPE: "Slashing", WEAPON_SIZE: "Medium", WEAPON_TYPE: "Longsword",
      });
      const weapons = (await buildCarrying("Bjorn Ironhand", [{ item: variant.id, location: "Main Hand", weaponSet: 0 }])).getDetailedCharacterWeapons().getWeapons();
      expect(weapons["longsword"]).toBeDefined();
      expect(weapons["longsword1"]).toBeUndefined();
    });

    test("write damage with the strength bonus added or taken away", async () => {
      // STR 18, Longsword.
      expect(weaponSet(await buildSeeded("Bjorn Ironhand")).mainhand!.damage.total).toMatch(/^\d+d\d+ \+ \d+$/);
      // STR 8: a dagger takes 1 off; a crossbow fires without strength.
      const vex = await buildSeeded("Vex Flamecaller");
      expect(weaponSet(vex).mainhand).toMatchObject({ name: "Dagger", damage: { total: "1d4 - 1" } });
      expect(weaponSet(vex, "1").twohanded).toMatchObject({ name: "Light Crossbow", damage: { total: "1d8" } });
    });

    test("cap a mighty composite bow's strength to damage at its rating, and aim it with dexterity", async () => {
      const { itemMap } = await getSeedCtx();
      await Properties.create(db, { entityId: itemMap["Composite Longbow"], entityType: "items", type: "WEAPON_MIGHTY", value: "2" });
      invalidateSeededRuleset((await getSeedCtx()).rulesetId);
      const bow = weaponSet(await buildCarrying("Bjorn Ironhand", [{ item: "Composite Longbow", location: "Two Handed", weaponSet: 0 }])).twohanded;
      expect(bow).toMatchObject({ name: "Composite Longbow", damage: { strength: 2, total: "1d8 + 2" }, tohit: { strength: 2 } });
    });

    test("aim a thrown dagger with strength and a crossbow with dexterity", async () => {
      // STR 8 (-1), DEX 14 (+2), BAB +1.
      const vex = await buildSeeded("Vex Flamecaller");
      expect(weaponSet(vex).mainhand).toMatchObject({ name: "Dagger", tohit: { strength: -1, total: [0] } });
      expect(weaponSet(vex, "1").twohanded).toMatchObject({ name: "Light Crossbow", tohit: { strength: 2, total: [3] } });
    });

    describe("with Weapon Finesse", () => {
      test("aim a light weapon with dexterity when it's higher, damage still using strength", async () => {
        // An elf rogue: STR 10, DEX 20 (+5).
        expect(weaponSet(await buildSeeded("Lyra Shadowstep"))).toMatchObject({
          mainhand: { name: "Shortsword", tohit: { strength: 5 }, damage: { strength: 0 } },
          offhand: { name: "Dagger", tohit: { strength: 5 } },
        });
      });

      test("keep strength when it's higher", async () => {
        // STR 18 (+4) over DEX 14 (+2).
        expect(weaponSet(await buildCarrying("Bjorn Ironhand", [{ item: "Shortsword", location: "Main Hand", weaponSet: 0 }])).mainhand!.tohit.strength).toBe(4);
      });
    });

    describe("proficiency", () => {
      test("costs a weapon the character isn't proficient with 4 to hit", async () => {
        // Weapon Focus: Longsword gives +1.
        expect(weaponSet(await buildSeeded("Bjorn Ironhand")).mainhand).toMatchObject({ name: "Longsword", proficient: true, tohit: { misc: 1 }, itemId: expect.any(String) });
        expect(weaponSet(await buildSeeded("Vex Flamecaller")).mainhand).toMatchObject({ name: "Dagger", proficient: true, tohit: { misc: 0 } });
        // A wizard with a longsword: BAB 1, STR 8.
        expect(weaponSet(await buildCarrying("Elara Starweaver", [{ item: "Longsword", location: "Main Hand", weaponSet: 0 }])).mainhand).toMatchObject({
          name: "Longsword", proficient: false, tohit: { strength: -1, misc: -4, total: [-4] },
        });
      });

      test("never costs an unarmed strike", async () => {
        expect(weaponSet(await buildCarrying("Bjorn Ironhand")).mainhand).toMatchObject({ name: "Unarmed Strike", itemId: null, proficient: true, tohit: { misc: 0 } });
      });
    });

    describe("unarmed", () => {
      test("attack once below BAB 6", async () => {
        // BAB 5 + STR 4.
        expect(weaponSet(await buildCarrying("Bjorn Ironhand")).mainhand).toMatchObject({ name: "Unarmed Strike", tohit: { total: [9] } });
      });

      test("strike harder with monk levels, gauntlets included but not spiked ones or other weapons", async () => {
        expect(weaponSet(await buildCarrying("Bjorn Ironhand")).mainhand!.damage.base).toBe("1d3");
        // Monk 3.
        expect(weaponSet(await buildCarrying("Zen Whitepetal")).mainhand).toMatchObject({ name: "Unarmed Strike", damage: { base: "1d6" } });
        expect(weaponSet(await buildCarrying("Zen Whitepetal", [{ item: "Gauntlet", location: "Main Hand", weaponSet: 1 }]), "1").mainhand).toMatchObject({ name: "Gauntlet", damage: { base: "1d6" } });
        expect(weaponSet(await buildCarrying("Zen Whitepetal", [{ item: "Spiked Gauntlet", location: "Main Hand", weaponSet: 0 }])).mainhand).toMatchObject({ name: "Spiked Gauntlet", damage: { base: "1d4" } });
        expect(weaponSet(await buildCarrying("Zen Whitepetal", [{ item: "Longsword", location: "Main Hand", weaponSet: 0 }])).mainhand).toMatchObject({ name: "Longsword", damage: { base: "1d8" } });
      });
    });

    test("step a small character's damage dice down", async () => {
      const smallFighter = await asHalfling("Bjorn Ironhand");
      await carry(smallFighter, []);
      expect(weaponSet(await build(smallFighter)).mainhand!.damage.base).toBe("1d2");
      await carry(smallFighter, [{ item: "Longsword", location: "Main Hand", weaponSet: 0 }]);
      expect(weaponSet(await build(smallFighter)).mainhand).toMatchObject({ name: "Longsword", damage: { base: "1d6" } });

      // A monk 3's 1d6 steps down to 1d4.
      const smallMonk = await asHalfling("Zen Whitepetal");
      await carry(smallMonk, []);
      expect(weaponSet(await build(smallMonk)).mainhand).toMatchObject({ name: "Unarmed Strike", damage: { base: "1d4" } });
    });

    describe("with Uncanny Blow", () => {
      /** Bjorn on a fork using Complete Warrior, with its Uncanny Blow, holding a bastard sword. */
      async function setupUncannyBlow(location: "Main Hand" | "Two Handed") {
        const bjorn = await seeded("Bjorn Ironhand");
        const fork = await forkWith(DND35_COMPLETE_WARRIOR_NAME);
        await db.update(charactersInCharacter).set({ rulesetId: fork.id }).where(eq(charactersInCharacter.id, bjorn.id));
        const extension = (await Rulesets.findOne(db, { name: DND35_COMPLETE_WARRIOR_NAME }))!;
        const uncannyBlow = (await Feats.findOne(db, { name: "Uncanny Blow (Exotic Weapon Master Exotic Weapon Stunt)", rulesetId: extension.id }))!;
        const stunt = (await Aptitudes.findOne(db, { name: "Exotic Weapon Master Exotic Weapon Stunt", rulesetId: extension.id }))!;
        const [level] = await CharacterLevels.findMany(db, { characterId: bjorn.id });
        await CharacterLevelFeats.create(db, { characterLevelId: level.id, featId: uncannyBlow.id, aptitudeId: stunt.id });
        const character = { ...bjorn, rulesetId: fork.id };
        await carry(character, [{ item: "Bastard Sword", location, weaponSet: 0 }]);
        return build(character);
      }

      // The stunt needs the weapon in two hands or Power Attack, which Bjorn has.
      test.each(["Main Hand", "Two Handed"] as const)("doubles strength to damage with an exotic weapon held %s", async (location) => {
        const exotic = Object.values((await setupUncannyBlow(location)).getDetailedCharacterWeapons().getWeapons()["exotic"]);
        // STR 18: +4 doubled.
        expect(exotic).toHaveLength(1);
        expect(exotic[0].damage).toMatchObject({ strmultiplier: 2, strength: 8 });
      });
    });
  });

  describe("armor class", () => {
    test("adds armor, capping dexterity at its limit, and shows its penalties", async () => {
      const bjorn = await buildCarrying("Bjorn Ironhand", [{ item: "Chain Mail", location: "Torso" }]);
      expect(bjorn.getDetailedCharacterArmors().getArmors()["chainmail"]).toMatchObject({ name: "Chain Mail", ac: { bonus: 5, total: 5 }, checkpenalty: -5, spellfailure: 30, maxdex: 2 });
      // DEX 14 (+2), within Chain Mail's 2.
      expect(bjorn.getDetailedCharacterCombat().getCombat().ac).toMatchObject({ armor: 5, dexterity: 2, total: 17 });
    });

    test("adds a shield, dexterity uncapped", async () => {
      const bjorn = await buildCarrying("Bjorn Ironhand", [{ item: "Heavy Steel Shield", location: "Off Hand" }]);
      expect(bjorn.getDetailedCharacterShields().getShields()["heavysteelshield"]).toMatchObject({ name: "Heavy Steel Shield", ac: { bonus: 2, total: 2 }, checkpenalty: -2, spellfailure: 15 });
      expect(bjorn.getDetailedCharacterCombat().getCombat().ac).toMatchObject({ shield: 2, dexterity: 2, total: 14 });
    });

    test("adds armor and shield together, a weapon in hand", async () => {
      const bjorn = await buildCarrying("Bjorn Ironhand", [
        { item: "Longsword", location: "Main Hand", weaponSet: 0 },
        { item: "Chain Mail", location: "Torso" },
        { item: "Light Wooden Shield", location: "Off Hand" },
      ]);
      expect(weaponSet(bjorn).mainhand!.name).toBe("Longsword");
      expect(bjorn.getDetailedCharacterArmors().getArmors()["chainmail"].ac.bonus).toBe(5);
      expect(bjorn.getDetailedCharacterShields().getShields()["lightwoodenshield"].ac.bonus).toBe(1);
      expect(bjorn.getDetailedCharacterCombat().getCombat().ac).toMatchObject({ base: 10, armor: 5, shield: 1, dexterity: 2, total: 18 });
    });

    test("reads the armor properties of an item made from a template", async () => {
      const { itemMap } = await getSeedCtx();
      const derived = await createItem({ name: "Full Plate +1", type: "Armor", slot: "Torso", sourceItemId: itemMap["Full Plate"] });
      const bjorn = await buildCarrying("Bjorn Ironhand", [{ item: derived.id, location: "Torso" }]);
      expect(bjorn.getDetailedCharacterArmors().getArmors()["fullplate1"]).toMatchObject({ name: "Full Plate +1", ac: { bonus: 8 }, maxdex: 1, checkpenalty: -6, spellfailure: 35 });
      expect(bjorn.getDetailedCharacterCombat().getCombat().ac).toMatchObject({ armor: 8, dexterity: 1, total: 19 });
    });

    test("lowers a masterwork armor or shield's check penalty by 1", async () => {
      const armor = await createItem({ name: "Chain Mail (Masterwork)", type: "Armor", slot: "Torso" }, {
        ARMOR_PROFICIENCY: "Heavy", ARMOR_TYPE: "Chain Mail", ARMOR_AC_BONUS: "5", ARMOR_CHECK_PENALTY: "-5", ITEM_SPELL_FAILURE: "30", ARMOR_MAX_DEX: "2", ITEM_MASTERWORK: "true",
      });
      const shield = await createItem({ name: "Heavy Steel Shield (Masterwork)", type: "Shield", slot: "Off Hand" }, {
        SHIELD_PROFICIENCY: "Heavy", SHIELD_TYPE: "Heavy Steel Shield", SHIELD_AC_BONUS: "2", ARMOR_CHECK_PENALTY: "-2", ITEM_SPELL_FAILURE: "15", ITEM_MASTERWORK: "true",
      });
      const bjorn = await buildCarrying("Bjorn Ironhand", [{ item: armor.id, location: "Torso" }, { item: shield.id, location: "Off Hand" }]);
      expect(bjorn.getDetailedCharacterArmors().getArmors()["chainmailmasterwork"]).toMatchObject({ checkpenalty: -4, ac: { bonus: 5 }, spellfailure: 30, maxdex: 2 });
      expect(bjorn.getDetailedCharacterShields().getShields()["heavysteelshield"]).toMatchObject({ checkpenalty: -1, ac: { bonus: 2 }, spellfailure: 15 });
    });

    test("adds a monk's wisdom when unarmored, through a template modifier its requirements gate", async () => {
      // Monk 3: DEX 16 (+3), WIS 16 (+3).
      const zen = await buildSeeded("Zen Whitepetal");
      expect(zen.getDetailedCharacterCombat().getCombat().ac).toMatchObject({ base: 10, dexterity: 3, armor: 0, shield: 0, misc: 3, total: 16 });
      const acBonus = zen.getDetailedCharacterModifiers().getModifiers().appliedModifiers.find((m) => m.value === "{{ [abilities.wisdom.modifier] }}" && m.target === "combat.ac.misc");
      expect(acBonus).toBeDefined();
      // Its requirements: no armor, no shield.
      const gates = zen.getDetailedCharacterRequirements().getRequirements().fulfilledRequirementGroups.filter((group) => group.some((r) => r.entityId === acBonus!.id && r.entityType === "modifiers"));
      expect(gates.length).toBeGreaterThan(0);
    });
  });

  describe("speed", () => {
    test.each([["Breastplate", 20], ["Full Plate", 20], ["Leather Armor", 30]])("under %s is %i feet", async (armor, speed) => {
      const combat = (await buildCarrying("Bjorn Ironhand", [{ item: armor, location: "Torso" }])).getDetailedCharacterCombat().getCombat();
      expect(combat.speed).toMatchObject({ base: 30, total: speed });
    });
  });

  describe("modifiers", () => {
    test("apply a feat's bonus", async () => {
      const toughness = (await buildSeeded("Kael Stormborn")).getDetailedCharacterModifiers().getModifiers().appliedModifiers.find((m) => m.target === "combat.hp.misc");
      expect(toughness).toMatchObject({ operator: "add", value: "3" });
    });

    test("hold a weapon feat's bonus until the weapon is in hand", async () => {
      // Weapon Focus and Weapon Specialization: Longsword.
      const targets = ["items.weapons.longsword.tohit.misc", "items.weapons.longsword.damage.misc"];
      const empty = (await buildCarrying("Bjorn Ironhand")).getDetailedCharacterModifiers().getModifiers();
      expect(targets.map((target) => empty.inactiveModifiers.find((m) => m.target === target)?.value)).toEqual(["1", "2"]);

      const armed = (await buildCarrying("Bjorn Ironhand", [{ item: "Longsword", location: "Main Hand", weaponSet: 0 }])).getDetailedCharacterModifiers().getModifiers();
      expect(armed.inactiveModifiers.filter((m) => m.target.includes("longsword"))).toEqual([]);
      expect(targets.every((target) => armed.appliedModifiers.some((m) => m.target === target))).toBe(true);
    });

    test("leave none unapplied or skipped for a valid character", async () => {
      const { unappliedModifiers, skippedModifiers } = (await buildSeeded("Bjorn Ironhand")).getDetailedCharacterModifiers().getModifiers();
      expect(unappliedModifiers.filter((m) => m.target.startsWith("items.weapons.longsword."))).toEqual([]);
      expect(skippedModifiers).toEqual([]);
    });
  });

  describe("requirements", () => {
    test("are all met for valid seeded characters", async () => {
      for (const [name, feats] of [["Bjorn Ironhand", 5], ["Kael Stormborn", 3]] as const) {
        const { fulfilledRequirementGroups, unmetRequirementGroups, invalidRequirements } = (await buildSeeded(name)).getDetailedCharacterRequirements().getRequirements();
        expect(fulfilledRequirementGroups.length).toBeGreaterThanOrEqual(feats);
        expect(unmetRequirementGroups).toEqual([]);
        expect(invalidRequirements).toEqual([]);
      }
    });

    test("go unmet when a score drops below a feat's prerequisite", async () => {
      // Power Attack and Cleave need STR 13.
      const bjorn = await seeded("Bjorn Ironhand");
      const { abilityMap } = await getSeedCtx();
      await db.update(characterAbilitiesInCharacter).set({ score: 10 })
        .where(and(eq(characterAbilitiesInCharacter.characterId, bjorn.id), eq(characterAbilitiesInCharacter.abilityId, abilityMap["Strength"])));
      expect((await build(bjorn)).getDetailedCharacterRequirements().getRequirements().unmetRequirementGroups.length).toBeGreaterThan(0);
    });
  });

  describe("feats", () => {
    test("don't count a proficiency two classes grant twice", async () => {
      // A barbarian level grants the fighter's proficiency feats again.
      const bjorn = await seeded("Bjorn Ironhand");
      const { klassMap } = await getSeedCtx();
      await addCharacterLevel(bjorn.id, (await KlassLevels.findOneByKlassAndLevel(db, { klassId: klassMap.pc["Barbarian"], level: 1 }))!.id);
      const detailed = await build(bjorn);

      const general = detailed.getDetailedCharacterAptitudes().getAptitudes()["general"];
      expect(general.available).toBeGreaterThanOrEqual(0);
      expect(general.available).toBe(general.allowed - general.spent);
      const nonStacking = Object.values(detailed.getDetailedCharacterClasses().getCharacterClasses()).flatMap((klass) => klass.levels.flatMap((level) => level.feats)).filter((f) => !f.stackable).map((f) => f.id);
      expect(new Set(nonStacking).size).toBe(nonStacking.length);
    });

    describe("granted by another feat's modifier", () => {
      test("count as possessed, their own modifiers applying", async () => {
        // War Domain Weapon: Longsword grants Weapon Focus and the martial proficiency.
        const ctx = await getSeedCtx();
        const characterId = await createSeedCharacter("War Domain Test", { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 16, Charisma: 12 }, { xp: 1000 });
        const [fighter] = await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]);
        const [cleric] = await addClassLevels(db, ctx, characterId, "Cleric", [1], [8]);
        await addFeats(db, ctx, [fighter, cleric], [
          { levelIndex: 0, featName: "Power Attack", aptitude: "General" },
          { levelIndex: 0, featName: "Great Fortitude", aptitude: "General" },
          { levelIndex: 0, featName: "Improved Initiative", aptitude: "Fighter Bonus Feat" },
          { levelIndex: 1, featName: "War Domain", aptitude: "Cleric Domain" },
          { levelIndex: 1, featName: "Good Domain", aptitude: "Cleric Domain" },
          { levelIndex: 1, featName: "War Domain Weapon: Longsword", aptitude: "War Domain Weapon" },
        ]);
        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);

        const feats = detailed.getDetailedCharacterFeats().getFeats() as Record<string, { possessed: boolean }>;
        expect([feats["weaponfocuslongsword"].possessed, feats["martialweaponproficiencylongsword"].possessed]).toEqual([true, true]);
        // No longsword in hand: the focus bonus waits.
        expect(detailed.getDetailedCharacterModifiers().getModifiers().inactiveModifiers.find((m) => m.target === "items.weapons.longsword.tohit.misc")).toMatchObject({ value: "1", operator: "add" });
      });

      test("aren't held to their own prerequisites", async () => {
        // A first bard level grants Exotic Weapon Proficiency: Whip, which needs BAB 1; the bard has 0.
        const ctx = await getSeedCtx();
        const characterId = await createSeedCharacter("Whip Bard Test", { Strength: 10, Dexterity: 14, Constitution: 12, Intelligence: 12, Wisdom: 10, Charisma: 16 });
        await addFeats(db, ctx, await addClassLevels(db, ctx, characterId, "Bard", [1], [6]), [{ levelIndex: 0, featName: "Toughness", aptitude: "General" }]);
        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);

        expect((detailed.getDetailedCharacterFeats().getFeats()["exoticweaponproficiencywhip"] as { possessed: boolean }).possessed).toBe(true);
        expect(requirementIssues(detailed).find((issue) => issue.entityName === "Exotic Weapon Proficiency: Whip")).toBeUndefined();
      });
    });
  });

  describe("spells", () => {
    describe("save DCs", () => {
      test("add the spell's level, the casting ability and focus bonuses, shared across its groupings", async () => {
        // A wizard, INT 18 (+4), with Spell Focus: Evocation.
        const elara = await buildSeeded("Elara Starweaver");
        const groupings = elara.getDetailedCharacterPowerGroupings().getPowerGroupings();
        expect(Object.keys(groupings)).toEqual(expect.arrayContaining(["evocation", "abjuration", "conjuration"]));
        expect(Object.keys(groupings["evocation"]).length).toBeGreaterThanOrEqual(2);

        expect(groupings["evocation"]["burninghands"]).toMatchObject({ base: 10, level: 1, ability: 4, misc: 1, total: 16 });
        expect(groupings["evocation"]["light"]).toMatchObject({ base: 10, level: 0, ability: 4, misc: 1, total: 15 });
        // School, descriptor and name groupings hold the same DC.
        expect(groupings["burninghands"]["burninghands"]).toBe(groupings["evocation"]["burninghands"]);
        if (groupings["fire"]?.["burninghands"]) expect(groupings["fire"]["burninghands"]).toBe(groupings["evocation"]["burninghands"]);
        expect(elara.getDetailedCharacterPowers().getPower("Burning Hands")?.dc?.total).toBe(16);
      });

      test("use the class's casting ability: charisma for a sorcerer", async () => {
        // CHA 18 (+4), no Spell Focus.
        const dc = (await buildSeeded("Vex Flamecaller")).getDetailedCharacterPowerGroupings().getPowerGroupings()["evocation"]?.["burninghands"];
        expect(dc).toMatchObject({ base: 10, level: 1, ability: 4, total: 15 });
      });

      test("leave empty groupings for a character without spells", async () => {
        // Groupings exist for every school, so a Spell Focus has somewhere to point.
        const groupings = (await buildSeeded("Bjorn Ironhand")).getDetailedCharacterPowerGroupings().getPowerGroupings();
        expect(Object.keys(groupings).length).toBeGreaterThan(0);
        expect(Object.values(groupings).every((bucket) => Object.keys(bucket).length === 0)).toBe(true);
      });
    });

    describe("per day", () => {
      test("add the casting ability's bonus spells to the levels the class can cast", async () => {
        // Wizard 3 and cleric 3: 4, 2 and 1, plus one second- and first-level spell for INT 18 or WIS 16.
        expect(spellUses(await buildSeeded("Elara Starweaver"), "wizardspells", [0, 1, 2, 3])).toEqual([4, 3, 2, 0]);
        expect(spellUses(await buildSeeded("Theron Lightbringer"), "clericspells", [0, 1, 2, 3])).toEqual([4, 3, 2, 0]);
        // A third-level ranger casts nothing yet.
        expect(spellUses(await buildSeeded("Fenn Ashwalker"), "rangerspells", [0, 1, 2, 3, 4])).toEqual([0, 0, 0, 0, 0]);
      });

      test.each([1, 2])("rise with %i bonus caster level(s) from a prestige class", async (bonus) => {
        const ctx = await getSeedCtx();
        const theron = await seeded("Theron Lightbringer");
        const saves = await db.select({ id: savesInRules.id, name: savesInRules.name }).from(savesInRules).where(eq(savesInRules.rulesetId, ctx.rulesetId));
        const { levelIds } = await seedClass(db, ctx.rulesetId, {
          name: "Test Theurge", description: "Advances divine casting", hd: 6, levels: 10, skillPoints: 2, bab: "medium",
          saves: { fortitude: "good", reflex: "poor", will: "good" }, classSkills: ["Concentration"],
          casterLevelAdvancement: { type: "divine", levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
        }, { rulesetId: ctx.rulesetId, saveMap: Object.fromEntries(saves.map((s) => [s.name, s.id])), skillMap: ctx.skillMap, featMap: ctx.featMap, aptMap: ctx.aptMap, abilityMap: {} });
        invalidateSeededRuleset(ctx.rulesetId);
        // The class's aptitude and feat exist once it's seeded.
        const { featMap, aptMap } = await getSeedCtx();
        for (let level = 1; level <= bonus; level++) {
          await addCharacterLevel(theron.id, levelIds[level], { feats: [{ featId: featMap["Advance Cleric Spellcasting"], aptitudeId: aptMap["Bonus Divine Caster Level"] }] });
        }

        const detailed = await build(theron);
        expect(detailed.getDetailedCharacterClasses().getCharacterClasses()["cleric"]).toMatchObject({ level: 3, bonuscasterlevel: bonus });
        // A cleric 4 casts 5, 3 and 2; a cleric 5 opens third-level spells.
        if (bonus === 1) {
          expect(spellUses(detailed, "clericspells", [0, 1, 2, 3])).toEqual([5, 4, 3, 0]);
          expect(spellLevel(detailed, "clericspells", 3).allowed).toBe(0);
        } else {
          expect(spellUses(detailed, "clericspells", [0, 1, 2, 3, 4])).toEqual([5, 4, 3, 2, 0]);
          expect([3, 4].map((level) => spellLevel(detailed, "clericspells", level).allowed)).toEqual([ALLOWED_ALL, 0]);
          const levels = new Set(allPowers(detailed).map((p) => (p as { powerLevel?: number | null }).powerLevel));
          expect([levels.has(3), levels.has(4)]).toEqual([true, false]);
        }
      });
    });

    test("give a cleric every spell of the levels it can cast, and none above", async () => {
      // Cleric 3 casts up to second level.
      const theron = await buildSeeded("Theron Lightbringer");
      expect(theron.getDetailedCharacterAptitudes().isLeveledAptitude("clericspells")).toBe(true);
      const knowsAll = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((level) => spellLevel(theron, "clericspells", level)?.allowed === ALLOWED_ALL);
      expect(knowsAll).toEqual([0, 1, 2]);
      const levels = Object.values(theron.getDetailedCharacterPowers().getFlatPowers()).map((entry) => (entry.power as { powerLevel?: number | null }).powerLevel).filter((level) => level != null);
      expect(levels.every((level) => knowsAll.includes(level!))).toBe(true);
    });

    describe("of a cleric's domains", () => {
      test("join the cleric's list with the domain's tag, up to the levels it casts", async () => {
        // Sun domain: Heat Metal (2nd level, not a cleric spell), Fire Shield (4th).
        const theron = await buildSeeded("Theron Lightbringer");
        const clericPowers = theron.getDetailedCharacterClasses().getCharacterClasses()["cleric"].levels.flatMap((level) => level.powers);
        const heatMetal = clericPowers.find((p) => p.name === "Heat Metal")!;
        expect(heatMetal.aptitudeId).toBe(theron.getDetailedCharacterAptitudes().getAptitudes()["clericspells"].id);
        expect(theron.getSpellTags()[heatMetal.id]).toContain("Sun Domain");
        expect(allPowers(theron).map((p) => p.name)).not.toContain("Fire Shield");
      });

      test("open with bonus caster levels", async () => {
        // Cleric 7 / Stormlord 5: the storm domain's fifth and sixth levels open.
        const ctx = await getSeedCtx();
        const extension = (await Rulesets.findOne(db, { name: DND35_COMPLETE_DIVINE_NAME }))!;
        const fork = await forkWith(DND35_COMPLETE_DIVINE_NAME);
        const characterId = await createSeedCharacter("Storm Cleric", { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 18, Charisma: 10 }, { xp: 66000, alignment: "Chaotic Neutral", rulesetId: fork.id });
        const clericLevels = await addClassLevels(db, ctx, characterId, "Cleric", [1, 2, 3, 4, 5, 6, 7], [8, 6, 7, 6, 8, 6, 7]);
        await addFeats(db, ctx, clericLevels, [{ levelIndex: 0, featName: "Storm Domain", aptitude: "Cleric Domain" }, { levelIndex: 0, featName: "War Domain", aptitude: "Cleric Domain" }]);
        const stormlord = (await Klasses.findOne(db, { name: "Stormlord", rulesetId: extension.id }))!;
        const advance = (await Feats.findOne(db, { name: "Advance Cleric Spellcasting", rulesetId: extension.id }))?.id ?? ctx.featMap["Advance Cleric Spellcasting"];
        const bonusLevel = (await Aptitudes.findOne(db, { name: "Bonus Divine Caster Level", rulesetId: extension.id }))?.id ?? ctx.aptMap["Bonus Divine Caster Level"];
        for (let level = 1; level <= 5; level++) {
          const klassLevel = (await KlassLevels.findOneByKlassAndLevel(db, { klassId: stormlord.id, level }))!;
          await addCharacterLevel(characterId, klassLevel.id, { feats: [{ featId: advance, aptitudeId: bonusLevel }] });
        }

        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
        expect(detailed.getDetailedCharacterClasses().getCharacterClasses()["cleric"]).toMatchObject({ level: 7, bonuscasterlevel: 5 });
        expect([5, 6, 7].map((level) => spellLevel(detailed, "stormdomainspells", level))).toMatchObject([{ allowed: ALLOWED_ALL, uses: 1 }, { allowed: ALLOWED_ALL, uses: 1 }, { allowed: 0 }]);
        const tags = detailed.getSpellTags();
        const storm = allPowers(detailed).filter((p) => tags[p.id]?.includes("Storm Domain")).map((p) => p.name);
        expect(storm).toEqual(expect.arrayContaining(["Ice Storm", "Call Lightning Storm"]));
      });
    });

    describe("tags", () => {
      test("mark a cleric's domain spells and a specialist's school", async () => {
        const theronTags = Object.values((await buildSeeded("Theron Lightbringer")).getSpellTags()).flat();
        expect(theronTags).toEqual(expect.arrayContaining(["Healing Domain", "Sun Domain"]));

        const elara = await buildSeeded("Elara Starweaver");
        const tags = elara.getSpellTags();
        const byName = Object.fromEntries(allPowers(elara).map((p) => [p.name, tags[p.id] ?? []]));
        expect(byName["Magic Missile"]).toContain("Evocation Specialist");
        expect(byName["Burning Hands"]).toContain("Evocation Specialist");
        expect(byName["Web"]).not.toContain("Evocation Specialist");

        expect((await buildSeeded("Bjorn Ironhand")).getSpellTags()).toEqual({});
      });
    });

    describe("granted by a feat's modifier", () => {
      /** A new wizard 1 whose Toughness grants Magic Missile, which gets `requirement` of its own when given. */
      async function setupGrantedSpell({ requirement = false, spellFocus = false } = {}) {
        const ctx = await getSeedCtx();
        const characterId = await createSeedCharacter("Granted Spell Test", WIZARD_SCORES, { xp: 1000 });
        const levelIds = await addClassLevels(db, ctx, characterId, "Wizard", [1], [4]);
        await addSkills(db, ctx, levelIds, [{ levelIndex: 0, skillName: "Spellcraft", rank: 4 }, { levelIndex: 0, skillName: "Concentration", rank: 4 }]);
        await addFeats(db, ctx, levelIds, [
          { levelIndex: 0, featName: spellFocus ? "Spell Focus: Evocation" : "Improved Initiative", aptitude: "General" },
          { levelIndex: 0, featName: "Scribe Scroll", aptitude: "Wizard Bonus Feat" },
          { levelIndex: 0, featName: "Toughness", aptitude: "General" },
        ]);
        await addPowers(db, ctx, levelIds, ["Detect Magic", "Read Magic", "Mage Armor"].map((powerName) => ({ levelIndex: 0, powerName, aptitude: "Wizard Spells" })));
        await Modifiers.create(db, { sourceId: ctx.featMap["Toughness"], sourceType: "feats", target: "powers.magicmissile.wizard.known", value: "true", valueType: "boolean", operator: "set" });
        if (requirement) {
          await Requirements.create(db, { entityId: ctx.powerMap["Magic Missile"], entityType: "powers", level: "1", target: "classes.wizard.level", operator: "greater_than_or_equal", value: "5", valueType: "number" });
        }
        invalidateSeededRuleset(ctx.rulesetId);
        return build((await Characters.findOne(db, { id: characterId }))!);
      }

      test("are known, next to those picked", async () => {
        const spells = (await setupGrantedSpell()).getDetailedCharacterPowers();
        expect(["magicmissile", "detectmagic", "burninghands"].map((spell) => spells.getSpellEntry(spell, "wizard")?.known)).toEqual([true, true, false]);
      });

      test("aren't held to their own prerequisites", async () => {
        // Magic Missile needs wizard 5 here; the grant is the gate.
        const detailed = await setupGrantedSpell({ requirement: true });
        expect(detailed.getDetailedCharacterPowers().getSpellEntry("magicmissile", "wizard")?.known).toBe(true);
        expect(requirementIssues(detailed).find((issue) => issue.entityName === "Magic Missile")).toBeUndefined();
      });

      test("get the school's DC bonuses", async () => {
        // 10 + 1 + INT 16 (+3) + Spell Focus: Evocation.
        const granted = (await setupGrantedSpell({ spellFocus: true })).getVirtuallyPossessedPowersWithAptitudes();
        expect(granted.find((vp) => vp.power.name === "Magic Missile")).toMatchObject({ dc: 15 });
      });
    });

    describe("the highest spell level cast, by kind", () => {
      test("counts arcane and divine casting apart", async () => {
        expect((await buildSeeded("Elara Starweaver")).getSpellcasting()).toMatchObject({ arcane: 2, divine: 0 });
        expect((await buildSeeded("Theron Lightbringer")).getSpellcasting()).toMatchObject({ arcane: 0, divine: 2 });
        expect((await buildSeeded("Bjorn Ironhand")).getSpellcasting()).toMatchObject({ arcane: 0, divine: 0 });
      });

      test("can be required", async () => {
        const elara = await buildSeeded("Elara Starweaver");
        const now = new Date().toISOString();
        const atLeast = (target: string) => [[{
          id: target, entityId: "test", entityType: "test", level: "1", target, operator: "greater_than_or_equal", value: "2", valueType: "number",
          chainingOperator: null, createdAt: now, deletedAt: null, updatedAt: now,
        }]];
        expect(elara.areRequirementsMet(atLeast("spellcasting.arcane"))).toBe(true);
        expect(elara.areRequirementsMet(atLeast("spellcasting.divine"))).toBe(false);
      });

      test("counts while projecting a prestige class that requires it", async () => {
        // Regression: the value was 0 or 1 during the build, so a cleric 5 failed the Thaumaturgist's divine 3.
        const ctx = await getSeedCtx();
        const fork = await forkWith(DND35_DMG_NAME);
        const characterId = await createSeedCharacter("Thaumaturgist Candidate", { Strength: 10, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 16, Charisma: 12 }, { xp: 15000, rulesetId: fork.id });
        const levelIds = await addClassLevels(db, ctx, characterId, "Cleric", [1, 2, 3, 4, 5], [8, 6, 7, 6, 7]);
        const skills = ["Concentration", "Heal", "Knowledge (Religion)", "Spellcraft"];
        await addSkills(db, ctx, levelIds, levelIds.flatMap((_, levelIndex) => skills.map((skillName) => ({ levelIndex, skillName, rank: levelIndex === 0 ? 4 : 1 }))));
        await addFeats(db, ctx, levelIds, [
          { levelIndex: 0, featName: "Spell Focus: Conjuration", aptitude: "General" },
          { levelIndex: 0, featName: "Combat Casting", aptitude: "General" },
          { levelIndex: 0, featName: "Healing Domain", aptitude: "Cleric Domain" },
          { levelIndex: 0, featName: "Sun Domain", aptitude: "Cleric Domain" },
          { levelIndex: 2, featName: "Toughness", aptitude: "General" },
        ]);
        const thaumaturgist = (await Klasses.findOne(db, { name: "Thaumaturgist", rulesetId: (await Rulesets.findOne(db, { name: DND35_DMG_NAME }))!.id }))!;
        const firstLevel = (await KlassLevels.findOneByKlassAndLevel(db, { klassId: thaumaturgist.id, level: 1 }))!;

        const detailed = new DetailedCharacter((await Characters.findOne(db, { id: characterId }))!);
        const now = new Date().toISOString();
        await detailed.build(undefined, {
          characterLevels: [{ id: "00000000-0000-0000-0000-000000000099", characterId, klassLevelId: firstLevel.id, hp: 4, abilityId: null, createdAt: now, updatedAt: now, deletedAt: null }],
        });
        expect(requirementIssues(detailed)).toEqual([]);
      });
    });
  });

  describe("encumbrance", () => {
    test("weighs the inventory against the character's strength", async () => {
      // STR 18: loads of 100, 200 and 300 lbs; the seeded inventory weighs 95.
      const bjorn = await buildSeeded("Bjorn Ironhand");
      const light = { heavyload: 300, mediumload: 200, lightload: 100, carriedweight: 95, load: "light", maxdex: Infinity, checkpenalty: 0 };
      expect(bjorn.getDetailedCharacterEncumbrance().getEncumbrance()).toMatchObject(light);
      expect(bjorn.getDetailedCharacterCombat().getCombat().encumbrance).toMatchObject({ load: "light", heavyload: 300, carriedweight: 95 });

      expect((await buildCarrying("Bjorn Ironhand")).getDetailedCharacterEncumbrance().getEncumbrance()).toMatchObject({ carriedweight: 0, load: "light", maxdex: Infinity, checkpenalty: 0 });
      // Weight times quantity: ten 1 lb torches.
      expect((await buildCarrying("Bjorn Ironhand", [{ item: "Torch", quantity: 10, equipped: false }])).getDetailedCharacterEncumbrance().getEncumbrance().carriedweight).toBe(10);
    });

    test.each([
      // STR 8 and STR 20 (a half-orc's 18 + 2).
      ["Elara Starweaver", { heavyload: 80, mediumload: 53, lightload: 26 }],
      ["Grak Thunderfist", { heavyload: 400, mediumload: 266, lightload: 133 }],
    ])("sets %s's loads by strength", async (name, loads) => {
      expect((await buildSeeded(name)).getDetailedCharacterEncumbrance().getEncumbrance()).toMatchObject(loads);
    });

    test.each([
      // Full plate, a barrel, a chest and rope.
      ["medium", [{ item: "Full Plate", location: "Torso" }, { item: "Barrel (empty)", equipped: false }, { item: "Chest (empty)", equipped: false }, { item: "Rope, hempen (50 ft.)", equipped: false }], { carriedweight: 115, maxdex: 3, checkpenalty: -3 }],
      ["heavy", [{ item: "Barrel (empty)", quantity: 7, equipped: false }], { carriedweight: 210, maxdex: 1, checkpenalty: -6 }],
      ["overloaded", [{ item: "Barrel (empty)", quantity: 11, equipped: false }], { carriedweight: 330, maxdex: 0, checkpenalty: -6 }],
    ] as [string, Carried[], object][])("of a %s load caps dexterity and costs checks", async (load, carried, expected) => {
      expect((await buildCarrying("Bjorn Ironhand", carried)).getDetailedCharacterEncumbrance().getEncumbrance()).toMatchObject({ load, ...expected });
    });

    test("slows the character", async () => {
      const barrels = (quantity: number): Carried[] => [{ item: "Barrel (empty)", quantity, equipped: false }];
      expect((await buildCarrying("Bjorn Ironhand", barrels(4))).getDetailedCharacterCombat().getCombat()).toMatchObject({ encumbrance: { load: "medium" }, speed: { base: 30, total: 20 } });
      expect((await buildCarrying("Bjorn Ironhand", barrels(11))).getDetailedCharacterCombat().getCombat()).toMatchObject({ encumbrance: { load: "overloaded" }, speed: { total: 5 } });
      // A dwarf's 20 feet become 15, and the barbarian's fast movement still adds.
      const kael = (await buildCarrying("Kael Stormborn", barrels(3))).getDetailedCharacterCombat().getCombat();
      expect(kael).toMatchObject({ encumbrance: { load: "medium" }, speed: { base: 20 } });
      expect(kael.speed.total).toBe(15 + kael.speed.misc);
    });

    test("caps dexterity in armor class and costs weight-affected skills, unless the armor costs more", async () => {
      // A heavy load's max dex 1, over DEX 14's +2.
      expect((await buildCarrying("Bjorn Ironhand", [{ item: "Barrel (empty)", quantity: 7, equipped: false }])).getDetailedCharacterCombat().getCombat()).toMatchObject({ encumbrance: { maxdex: 1 }, ac: { dexterity: 1, total: 11 } });

      const skills = async (carried: Carried[]) => {
        const { swim, climb } = (await buildCarrying("Bjorn Ironhand", carried)).getDetailedCharacterSkills().getSkills();
        return [swim?.weight, climb?.weight];
      };
      // A medium load's -3.
      expect(await skills([{ item: "Barrel (empty)", quantity: 4, equipped: false }])).toEqual([3, 3]);
      // Chain mail's -5 wins over the medium load's -3.
      expect(await skills([{ item: "Chain Mail", location: "Torso" }, { item: "Barrel (empty)", quantity: 3, equipped: false }])).toEqual([5, 5]);
    });
  });
});
