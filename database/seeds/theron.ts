import type { Db } from "@/server/database/index.ts";
import { addClassLevels, addFeats, addInventory, addSkills, createCharacter, getSeedContext } from "@/database/seeds/helpers.ts";

// Human Cleric 3 — Skills: (2+1+1)*4 + (2+1+1)*2 = 24
export default async function seed(db: Db) {
  const ctx = await getSeedContext(db);

  const characterId = await createCharacter(db, ctx, {
    raceName: "Human",
    name: "Theron Lightbringer",
    xp: 3000,
    alignment: "Lawful Good",
    age: 35,
    gender: "Male",
    height: "183",
    weight: "85",
    description: "A devout cleric of Pelor, Theron travels the land healing the sick and smiting the undead. His unwavering faith radiates through his warm smile and the golden symbol he wears.",
    abilities: { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 16, Charisma: 12 },
    languages: ["Common", "Celestial"],
  });

  const levelIds = await addClassLevels(db, ctx, characterId, "Cleric", [1, 2, 3], [8, 6, 7]);

  // Total skills: 24
  await addSkills(db, ctx, levelIds, [
    // L1 (16 points)
    { levelIndex: 0, skillName: "Concentration", rank: 4 },
    { levelIndex: 0, skillName: "Heal", rank: 4 },
    { levelIndex: 0, skillName: "Knowledge (Religion)", rank: 4 },
    { levelIndex: 0, skillName: "Diplomacy", rank: 4 },
    // L2 (4 points)
    { levelIndex: 1, skillName: "Concentration", rank: 1 },
    { levelIndex: 1, skillName: "Diplomacy", rank: 1 },
    { levelIndex: 1, skillName: "Spellcraft", rank: 1 },
    { levelIndex: 1, skillName: "Heal", rank: 1 },
    // L3 (4 points)
    { levelIndex: 2, skillName: "Heal", rank: 1 },
    { levelIndex: 2, skillName: "Knowledge (Religion)", rank: 1 },
    { levelIndex: 2, skillName: "Spellcraft", rank: 1 },
    { levelIndex: 2, skillName: "Concentration", rank: 1 },
  ]);

  // General feats: floor(3/3)+1 = 2, +1 human bonus = 3
  await addFeats(db, ctx, levelIds, [
    { levelIndex: 0, featName: "Combat Casting", aptitude: "General" },
    { levelIndex: 0, featName: "Improved Initiative", aptitude: "General" },
    { levelIndex: 2, featName: "Extra Turning", aptitude: "General" },
  ]);

  // Cleric domains: 2 picks at level 1
  await addFeats(db, ctx, levelIds, [
    { levelIndex: 0, featName: "Healing Domain", aptitude: "Cleric Domain" },
    { levelIndex: 0, featName: "Sun Domain", aptitude: "Cleric Domain" },
  ]);

  // Clerics know all spells on their list — no spell picks needed

  await addInventory(db, ctx, characterId, [
    { name: "Heavy Mace", quantity: 1, equipped: true, location: "Main Hand", weaponSet: 0 },
    { name: "Chain Mail", quantity: 1, equipped: true, location: "Torso" },
    { name: "Heavy Steel Shield", quantity: 1, equipped: true, location: "Off Hand" },
  ]);
}
