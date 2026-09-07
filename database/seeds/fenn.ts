import type { Db } from "@/server/database/index.ts";
import { addClassLevels, addFeats, addInventory, addSkills, createCharacter, getSeedContext } from "@/database/seeds/helpers.ts";

// Half-Elf Ranger 3 — Skills: (6+1)*4 + (6+1) + (6+1) = 42
export default async function seed(db: Db) {
  const ctx = await getSeedContext(db);

  const characterId = await createCharacter(db, ctx, {
    raceName: "Half-Elf",
    name: "Fenn Ashwalker",
    xp: 3000,
    alignment: "Neutral Good",
    age: 32,
    gender: "Male",
    height: "178",
    weight: "72",
    description: "A half-elven ranger who patrols the borderlands between civilization and the deep forest. Fenn inherited his mother's keen elven senses and his father's stubborn human resolve. He tracks goblins and worse through the wilderness, protecting scattered hamlets that have no other guardian.",
    abilities: { Strength: 14, Dexterity: 16, Constitution: 12, Intelligence: 12, Wisdom: 14, Charisma: 10 },
    languages: ["Common", "Elven", "Goblin"],
  });

  const levelIds = await addClassLevels(db, ctx, characterId, "Ranger", [1, 2, 3], [8, 7, 6]);

  // Total skills: 42
  await addSkills(db, ctx, levelIds, [
    // L1 (28 points)
    { levelIndex: 0, skillName: "Hide", rank: 4 },
    { levelIndex: 0, skillName: "Move Silently", rank: 4 },
    { levelIndex: 0, skillName: "Listen", rank: 4 },
    { levelIndex: 0, skillName: "Spot", rank: 4 },
    { levelIndex: 0, skillName: "Survival", rank: 4 },
    { levelIndex: 0, skillName: "Search", rank: 4 },
    { levelIndex: 0, skillName: "Knowledge (Nature)", rank: 4 },
    // L2 (7 points)
    { levelIndex: 1, skillName: "Hide", rank: 1 },
    { levelIndex: 1, skillName: "Move Silently", rank: 1 },
    { levelIndex: 1, skillName: "Listen", rank: 1 },
    { levelIndex: 1, skillName: "Spot", rank: 1 },
    { levelIndex: 1, skillName: "Survival", rank: 1 },
    { levelIndex: 1, skillName: "Climb", rank: 1 },
    { levelIndex: 1, skillName: "Swim", rank: 1 },
    // L3 (7 points)
    { levelIndex: 2, skillName: "Hide", rank: 1 },
    { levelIndex: 2, skillName: "Move Silently", rank: 1 },
    { levelIndex: 2, skillName: "Heal", rank: 1 },
    { levelIndex: 2, skillName: "Handle Animal", rank: 1 },
    { levelIndex: 2, skillName: "Knowledge (Geography)", rank: 1 },
    { levelIndex: 2, skillName: "Spot", rank: 1 },
    { levelIndex: 2, skillName: "Survival", rank: 1 },
  ]);

  // General feats: floor(3/3)+1 = 2 (Track + Endurance are free from Ranger)
  // Ranger Combat Style: Archery at L2 (grants Rapid Shot)
  // Favored Enemy (Ranger) grants 1 slot at L1 into the shared "Favored Enemy" aptitude
  await addFeats(db, ctx, levelIds, [
    { levelIndex: 0, featName: "Point Blank Shot", aptitude: "General" },
    { levelIndex: 0, featName: "Favored Enemy: Humanoid (Goblinoid)", aptitude: "Favored Enemy" },
    { levelIndex: 1, featName: "Rapid Shot", aptitude: "Ranger Combat Style (2nd)" },
    { levelIndex: 2, featName: "Precise Shot", aptitude: "General" },
  ]);

  await addInventory(db, ctx, characterId, [
    { name: "Longbow", quantity: 1, equipped: true, location: "Two Handed", weaponSet: 0 },
    { name: "Longsword", quantity: 1, equipped: false, location: "Main Hand", weaponSet: 1 },
    { name: "Studded Leather", quantity: 1, equipped: true, location: "Torso" },
  ]);
}
