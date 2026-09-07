import type { Db } from "@/server/database/index.ts";
import { addClassLevels, addFeats, addInventory, addSkills, createCharacter, getSeedContext } from "@/database/seeds/helpers.ts";

// Half-Orc Barbarian 3 — Skills: (4-1)*4 + (4-1)*2 = 18
export default async function seed(db: Db) {
  const ctx = await getSeedContext(db);

  const characterId = await createCharacter(db, ctx, {
    raceName: "Half-Orc",
    name: "Grak Thunderfist",
    xp: 3000,
    alignment: "Chaotic Neutral",
    age: 18,
    gender: "Male",
    height: "195",
    weight: "120",
    description: "A towering half-orc from the Shattered Peaks, Grak channels his rage into devastating power on the battlefield. His tribal tattoos glow faintly when his fury rises.",
    abilities: { Strength: 18, Dexterity: 12, Constitution: 16, Intelligence: 8, Wisdom: 10, Charisma: 6 },
    languages: ["Common", "Orc"],
  });

  const levelIds = await addClassLevels(db, ctx, characterId, "Barbarian", [1, 2, 3], [12, 10, 9]);

  // Total skills: 18
  await addSkills(db, ctx, levelIds, [
    // L1 (12 points)
    { levelIndex: 0, skillName: "Climb", rank: 4 },
    { levelIndex: 0, skillName: "Intimidate", rank: 4 },
    { levelIndex: 0, skillName: "Jump", rank: 4 },
    // L2 (3 points)
    { levelIndex: 1, skillName: "Climb", rank: 1 },
    { levelIndex: 1, skillName: "Survival", rank: 1 },
    { levelIndex: 1, skillName: "Swim", rank: 1 },
    // L3 (3 points)
    { levelIndex: 2, skillName: "Jump", rank: 1 },
    { levelIndex: 2, skillName: "Listen", rank: 1 },
    { levelIndex: 2, skillName: "Intimidate", rank: 1 },
  ]);

  // General feats: floor(3/3)+1 = 2
  await addFeats(db, ctx, levelIds, [
    { levelIndex: 0, featName: "Power Attack", aptitude: "General" },
    { levelIndex: 2, featName: "Cleave", aptitude: "General" },
  ]);

  await addInventory(db, ctx, characterId, [
    { name: "Greataxe", quantity: 1, equipped: true, location: "Two Handed", weaponSet: 0 },
    { name: "Hide Armor", quantity: 1, equipped: true, location: "Torso" },
  ]);
}
