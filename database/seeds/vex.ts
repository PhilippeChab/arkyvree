import type { Db } from "@/server/database/index.ts";
import { addClassLevels, addFeats, addInventory, addPowers, addSkills, createCharacter, getSeedContext } from "@/database/seeds/helpers.ts";
import { reconcileBondedForCharacter } from "@/server/services/characters/levels/dnd3.5/bondedReconcile.ts";

// Human Sorcerer 3 — Skills: (2+0+1)*4 + (2+0+1)*2 = 18
export default async function seed(db: Db) {
  const ctx = await getSeedContext(db);

  const characterId = await createCharacter(db, ctx, {
    raceName: "Human",
    name: "Vex Flamecaller",
    xp: 3000,
    alignment: "Chaotic Good",
    age: 22,
    gender: "Male",
    height: "178",
    weight: "72",
    description: "Born with fire in his veins, Vex discovered his sorcerous bloodline during a childhood accident that left his family barn in ashes. He now channels his innate power with reckless confidence.",
    abilities: { Strength: 8, Dexterity: 14, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 18 },
    languages: ["Common"],
  });

  const levelIds = await addClassLevels(db, ctx, characterId, "Sorcerer", [1, 2, 3], [4, 3, 4]);

  // Total skills: 18
  await addSkills(db, ctx, levelIds, [
    // L1 (12 points)
    { levelIndex: 0, skillName: "Bluff", rank: 4 },
    { levelIndex: 0, skillName: "Concentration", rank: 4 },
    { levelIndex: 0, skillName: "Spellcraft", rank: 4 },
    // L2 (3 points)
    { levelIndex: 1, skillName: "Bluff", rank: 1 },
    { levelIndex: 1, skillName: "Spellcraft", rank: 1 },
    { levelIndex: 1, skillName: "Use Magic Device", rank: 1 },
    // L3 (3 points)
    { levelIndex: 2, skillName: "Concentration", rank: 1 },
    { levelIndex: 2, skillName: "Spellcraft", rank: 1 },
    { levelIndex: 2, skillName: "Use Magic Device", rank: 1 },
  ]);

  // General feats: floor(3/3)+1 = 2, +1 human bonus = 3
  await addFeats(db, ctx, levelIds, [
    { levelIndex: 0, featName: "Combat Casting", aptitude: "General" },
    { levelIndex: 0, featName: "Improved Initiative", aptitude: "General" },
    { levelIndex: 2, featName: "Dodge", aptitude: "General" },
    { levelIndex: 0, featName: "Cat Familiar", aptitude: "Familiar Bond" },
  ]);

  // Sorcerer spells known per level: L1=4 cantrips +2 L1, L2=+1 cantrip, L3=+1 L1
  await addPowers(db, ctx, levelIds, [
    // L1: 4 cantrips, 2 L1 spells
    { levelIndex: 0, powerName: "Detect Magic", aptitude: "Sorcerer Spells" },
    { levelIndex: 0, powerName: "Light", aptitude: "Sorcerer Spells" },
    { levelIndex: 0, powerName: "Read Magic", aptitude: "Sorcerer Spells" },
    { levelIndex: 0, powerName: "Prestidigitation", aptitude: "Sorcerer Spells" },
    { levelIndex: 0, powerName: "Magic Missile", aptitude: "Sorcerer Spells" },
    { levelIndex: 0, powerName: "Burning Hands", aptitude: "Sorcerer Spells" },
    // L2: +1 cantrip
    { levelIndex: 1, powerName: "Mage Hand", aptitude: "Sorcerer Spells" },
    // L3: +1 L1 spell
    { levelIndex: 2, powerName: "Shield", aptitude: "Sorcerer Spells" },
  ]);

  await addInventory(db, ctx, characterId, [
    { name: "Dagger", quantity: 1, equipped: true, location: "Main Hand", weaponSet: 0 },
    { name: "Light Crossbow", quantity: 1, equipped: true, location: "Two Handed", weaponSet: 1 },
  ]);

  await reconcileBondedForCharacter(db, characterId);
}
