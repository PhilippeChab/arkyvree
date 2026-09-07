import type { Db } from "@/server/database/index.ts";
import { addClassLevels, addFeats, addInventory, addPowers, addSkills, createCharacter, getSeedContext } from "@/database/seeds/helpers.ts";
import { reconcileBondedForCharacter } from "@/server/services/characters/levels/dnd3.5/bondedReconcile.ts";

// Elf Wizard 3 — Skills: (2+4)*4 + (2+4)*2 = 36
export default async function seed(db: Db) {
  const ctx = await getSeedContext(db);

  const characterId = await createCharacter(db, ctx, {
    raceName: "Elf",
    name: "Elara Starweaver",
    xp: 3000,
    alignment: "Neutral Good",
    age: 130,
    gender: "Female",
    height: "170",
    weight: "48",
    description: "A studious elven wizard from the Celestial Academy, Elara weaves arcane formulae with mathematical precision. Her spellbook is filled with meticulous notes and elegant diagrams.",
    abilities: { Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 18, Wisdom: 12, Charisma: 10 },
    languages: ["Common", "Elven", "Draconic", "Sylvan"],
  });

  const levelIds = await addClassLevels(db, ctx, characterId, "Wizard", [1, 2, 3], [4, 3, 3]);

  // Total skills: 36
  await addSkills(db, ctx, levelIds, [
    // L1 (24 points)
    { levelIndex: 0, skillName: "Spellcraft", rank: 4 },
    { levelIndex: 0, skillName: "Concentration", rank: 4 },
    { levelIndex: 0, skillName: "Knowledge (Arcana)", rank: 4 },
    { levelIndex: 0, skillName: "Knowledge (Religion)", rank: 4 },
    { levelIndex: 0, skillName: "Decipher Script", rank: 4 },
    { levelIndex: 0, skillName: "Craft", rank: 4 },
    // L2 (6 points)
    { levelIndex: 1, skillName: "Spellcraft", rank: 1 },
    { levelIndex: 1, skillName: "Concentration", rank: 1 },
    { levelIndex: 1, skillName: "Knowledge (Arcana)", rank: 1 },
    { levelIndex: 1, skillName: "Knowledge (Religion)", rank: 1 },
    { levelIndex: 1, skillName: "Decipher Script", rank: 1 },
    { levelIndex: 1, skillName: "Craft", rank: 1 },
    // L3 (6 points)
    { levelIndex: 2, skillName: "Spellcraft", rank: 1 },
    { levelIndex: 2, skillName: "Concentration", rank: 1 },
    { levelIndex: 2, skillName: "Knowledge (Arcana)", rank: 1 },
    { levelIndex: 2, skillName: "Knowledge (Religion)", rank: 1 },
    { levelIndex: 2, skillName: "Decipher Script", rank: 1 },
    { levelIndex: 2, skillName: "Craft", rank: 1 },
  ]);

  // General feats: floor(3/3)+1 = 2
  await addFeats(db, ctx, levelIds, [
    { levelIndex: 0, featName: "Combat Casting", aptitude: "General" },
    { levelIndex: 2, featName: "Spell Focus: Evocation", aptitude: "General" },
    // Wizard specialization: Evocation, prohibit Illusion and Necromancy
    { levelIndex: 0, featName: "Evocation Specialist", aptitude: "Wizard Specialization" },
    { levelIndex: 0, featName: "Prohibit Illusion", aptitude: "Prohibited School" },
    { levelIndex: 0, featName: "Prohibit Necromancy", aptitude: "Prohibited School" },
    { levelIndex: 0, featName: "Owl Familiar", aptitude: "Familiar Bond" },
  ]);

  // Wizard 3 spellbook: L0=6, L1=5, L2=2
  await addPowers(db, ctx, levelIds, [
    // Cantrips (6)
    { levelIndex: 0, powerName: "Detect Magic", aptitude: "Wizard Spells" },
    { levelIndex: 0, powerName: "Light", aptitude: "Wizard Spells" },
    { levelIndex: 0, powerName: "Read Magic", aptitude: "Wizard Spells" },
    { levelIndex: 0, powerName: "Mage Hand", aptitude: "Wizard Spells" },
    { levelIndex: 0, powerName: "Prestidigitation", aptitude: "Wizard Spells" },
    { levelIndex: 0, powerName: "Resistance", aptitude: "Wizard Spells" },
    // Level 1 spellbook (5): 3 starting + 2 at L2
    { levelIndex: 0, powerName: "Magic Missile", aptitude: "Wizard Spells" },
    { levelIndex: 0, powerName: "Mage Armor", aptitude: "Wizard Spells" },
    { levelIndex: 0, powerName: "Shield", aptitude: "Wizard Spells" },
    { levelIndex: 1, powerName: "Sleep", aptitude: "Wizard Spells" },
    { levelIndex: 1, powerName: "Burning Hands", aptitude: "Wizard Spells" },
    // Level 2 spellbook (2): gained at L3
    { levelIndex: 2, powerName: "Scorching Ray", aptitude: "Wizard Spells" },
    { levelIndex: 2, powerName: "Web", aptitude: "Wizard Spells" },
  ]);

  await addInventory(db, ctx, characterId, [
    { name: "Quarterstaff", quantity: 1, equipped: true, location: "Two Handed", weaponSet: 0 },
  ]);

  await reconcileBondedForCharacter(db, characterId);
}
