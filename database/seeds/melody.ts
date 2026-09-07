import type { Db } from "@/server/database/index.ts";
import { addClassLevels, addFeats, addInventory, addPowers, addSkills, createCharacter, getSeedContext } from "@/database/seeds/helpers.ts";

// Half-Elf Bard 3 — Skills: (6+2)*4 + (6+2)*2 = 48
export default async function seed(db: Db) {
  const ctx = await getSeedContext(db);

  const characterId = await createCharacter(db, ctx, {
    raceName: "Half-Elf",
    name: "Melody Silverveil",
    xp: 3000,
    alignment: "Chaotic Good",
    age: 28,
    gender: "Female",
    height: "168",
    weight: "58",
    description: "A half-elven bard whose honeyed voice can charm a dragon or rally an army. Melody travels from court to tavern, collecting stories and songs — and occasionally picking up secrets she shouldn't know.",
    abilities: { Strength: 10, Dexterity: 14, Constitution: 12, Intelligence: 14, Wisdom: 10, Charisma: 16 },
    languages: ["Common", "Elven", "Sylvan"],
  });

  const levelIds = await addClassLevels(db, ctx, characterId, "Bard", [1, 2, 3], [5, 4, 6]);

  // Total skills: 48
  await addSkills(db, ctx, levelIds, [
    // L1 (32 points)
    { levelIndex: 0, skillName: "Perform", rank: 4 },
    { levelIndex: 0, skillName: "Diplomacy", rank: 4 },
    { levelIndex: 0, skillName: "Bluff", rank: 4 },
    { levelIndex: 0, skillName: "Sense Motive", rank: 4 },
    { levelIndex: 0, skillName: "Spellcraft", rank: 4 },
    { levelIndex: 0, skillName: "Use Magic Device", rank: 4 },
    { levelIndex: 0, skillName: "Gather Information", rank: 4 },
    { levelIndex: 0, skillName: "Concentration", rank: 4 },
    // L2 (8 points)
    { levelIndex: 1, skillName: "Perform", rank: 1 },
    { levelIndex: 1, skillName: "Diplomacy", rank: 1 },
    { levelIndex: 1, skillName: "Listen", rank: 1 },
    { levelIndex: 1, skillName: "Hide", rank: 1 },
    { levelIndex: 1, skillName: "Move Silently", rank: 1 },
    { levelIndex: 1, skillName: "Tumble", rank: 1 },
    { levelIndex: 1, skillName: "Knowledge (Local)", rank: 1 },
    { levelIndex: 1, skillName: "Knowledge (History)", rank: 1 },
    // L3 (8 points)
    { levelIndex: 2, skillName: "Perform", rank: 1 },
    { levelIndex: 2, skillName: "Bluff", rank: 1 },
    { levelIndex: 2, skillName: "Listen", rank: 1 },
    { levelIndex: 2, skillName: "Spellcraft", rank: 1 },
    { levelIndex: 2, skillName: "Concentration", rank: 1 },
    { levelIndex: 2, skillName: "Sense Motive", rank: 1 },
    { levelIndex: 2, skillName: "Hide", rank: 1 },
    { levelIndex: 2, skillName: "Move Silently", rank: 1 },
  ]);

  // General feats: floor(3/3)+1 = 2
  await addFeats(db, ctx, levelIds, [
    { levelIndex: 0, featName: "Dodge", aptitude: "General" },
    { levelIndex: 2, featName: "Combat Casting", aptitude: "General" },
  ]);

  // Bard spells known per level: L1=4 cantrips, L2=+1 cantrip +2 L1, L3=+1 cantrip +1 L1
  await addPowers(db, ctx, levelIds, [
    // L1: 4 cantrips
    { levelIndex: 0, powerName: "Detect Magic", aptitude: "Bard Spells" },
    { levelIndex: 0, powerName: "Light", aptitude: "Bard Spells" },
    { levelIndex: 0, powerName: "Ghost Sound", aptitude: "Bard Spells" },
    { levelIndex: 0, powerName: "Prestidigitation", aptitude: "Bard Spells" },
    // L2: +1 cantrip, +2 L1 spells
    { levelIndex: 1, powerName: "Message", aptitude: "Bard Spells" },
    { levelIndex: 1, powerName: "Charm Person", aptitude: "Bard Spells" },
    { levelIndex: 1, powerName: "Cure Light Wounds", aptitude: "Bard Spells" },
    // L3: +1 cantrip, +1 L1 spell
    { levelIndex: 2, powerName: "Mage Hand", aptitude: "Bard Spells" },
    { levelIndex: 2, powerName: "Sleep", aptitude: "Bard Spells" },
  ]);

  await addInventory(db, ctx, characterId, [
    { name: "Rapier", quantity: 1, equipped: true, location: "Main Hand", weaponSet: 0 },
    { name: "Studded Leather", quantity: 1, equipped: true, location: "Torso" },
  ]);
}
