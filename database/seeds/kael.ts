import type { Db } from "@/server/database/index.ts";
import { addClassLevels, addFeats, addInventory, addSkills, createCharacter, getSeedContext } from "@/database/seeds/helpers.ts";

// Dwarf Fighter 3/Barbarian 1 — Skills: Fighter (2*4+2+2)=12, Barbarian (4)=4 → 16
export default async function seed(db: Db) {
  const ctx = await getSeedContext(db);

  const characterId = await createCharacter(db, ctx, {
    raceName: "Dwarf",
    name: "Kael Stormborn",
    xp: 6000,
    alignment: "Neutral Good",
    age: 55,
    gender: "Male",
    height: "135",
    weight: "85",
    description: "A stout dwarven warrior who trained with the mountain guard before discovering a berserker rage deep within. Kael wields a battleaxe passed down from his clan's founder.",
    abilities: { Strength: 16, Dexterity: 13, Constitution: 16, Intelligence: 10, Wisdom: 12, Charisma: 8 },
    languages: ["Common", "Dwarven"],
  });

  // Fighter levels 1-3 (character levels 1-3)
  const fighterLevelIds = await addClassLevels(db, ctx, characterId, "Fighter", [1, 2, 3], [10, 8, 7]);
  // Barbarian level 1 (character level 4)
  const barbarianLevelIds = await addClassLevels(db, ctx, characterId, "Barbarian", [1], [12]);

  const allLevelIds = [...fighterLevelIds, ...barbarianLevelIds];

  // Total skills: 16
  await addSkills(db, ctx, allLevelIds, [
    // Fighter L1 (char level 1, ×4): 2*4 = 8 points
    { levelIndex: 0, skillName: "Climb", rank: 4 },
    { levelIndex: 0, skillName: "Intimidate", rank: 4 },
    // Fighter L2 (2 points)
    { levelIndex: 1, skillName: "Climb", rank: 1 },
    { levelIndex: 1, skillName: "Jump", rank: 1 },
    // Fighter L3 (2 points)
    { levelIndex: 2, skillName: "Intimidate", rank: 1 },
    { levelIndex: 2, skillName: "Swim", rank: 1 },
    // Barbarian L1 (char level 4, ×1): 4 points
    { levelIndex: 3, skillName: "Climb", rank: 1 },
    { levelIndex: 3, skillName: "Intimidate", rank: 1 },
    { levelIndex: 3, skillName: "Jump", rank: 1 },
    { levelIndex: 3, skillName: "Listen", rank: 1 },
  ]);

  // General feats: floor(4/3)+1 = 2
  // Fighter Bonus Feats: 2 (from Fighter L1 + L2 modifiers)
  await addFeats(db, ctx, allLevelIds, [
    // General
    { levelIndex: 0, featName: "Power Attack", aptitude: "General" },
    { levelIndex: 2, featName: "Toughness", aptitude: "General" },
    // Fighter Bonus
    { levelIndex: 0, featName: "Weapon Focus: Battleaxe", aptitude: "Fighter Bonus Feat" },
    { levelIndex: 1, featName: "Dodge", aptitude: "Fighter Bonus Feat" },
  ]);

  await addInventory(db, ctx, characterId, [
    { name: "Battleaxe", quantity: 1, equipped: true, location: "Main Hand", weaponSet: 0 },
    { name: "Scale Mail", quantity: 1, equipped: true, location: "Torso" },
    { name: "Heavy Steel Shield", quantity: 1, equipped: true, location: "Off Hand" },
  ]);
}
