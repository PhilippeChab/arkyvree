import type { Db } from "@/server/database/index.ts";
import { addClassLevels, addFeats, addInventory, addSkills, createCharacter, getSeedContext } from "@/database/seeds/helpers.ts";
import { reconcileBondedForCharacter } from "@/server/services/characters/levels/dnd3.5/bondedReconcile.ts";

// Human Druid 3 — Skills: (4+0+1)*4 + (4+0+1)*2 = 30
export default async function seed(db: Db) {
  const ctx = await getSeedContext(db);

  const characterId = await createCharacter(db, ctx, {
    raceName: "Human",
    name: "Rowan Thornwalker",
    xp: 3000,
    alignment: "True Neutral",
    age: 32,
    gender: "Male",
    height: "180",
    weight: "78",
    description: "Rowan grew up deep in the Whispering Forest, raised by a circle of druids who taught him to listen to the voice of the land. He wields the primal forces of nature to protect the wild places from those who would despoil them.",
    abilities: { Strength: 14, Dexterity: 12, Constitution: 14, Intelligence: 10, Wisdom: 16, Charisma: 8 },
    languages: ["Common", "Druidic"],
  });

  const levelIds = await addClassLevels(db, ctx, characterId, "Druid", [1, 2, 3], [7, 6, 8]);

  // Total skills: 30
  await addSkills(db, ctx, levelIds, [
    // L1 (20 points)
    { levelIndex: 0, skillName: "Concentration", rank: 4 },
    { levelIndex: 0, skillName: "Knowledge (Nature)", rank: 4 },
    { levelIndex: 0, skillName: "Survival", rank: 4 },
    { levelIndex: 0, skillName: "Spellcraft", rank: 4 },
    { levelIndex: 0, skillName: "Handle Animal", rank: 4 },
    // L2 (5 points)
    { levelIndex: 1, skillName: "Concentration", rank: 1 },
    { levelIndex: 1, skillName: "Survival", rank: 1 },
    { levelIndex: 1, skillName: "Listen", rank: 1 },
    { levelIndex: 1, skillName: "Spot", rank: 1 },
    { levelIndex: 1, skillName: "Handle Animal", rank: 1 },
    // L3 (5 points)
    { levelIndex: 2, skillName: "Knowledge (Nature)", rank: 1 },
    { levelIndex: 2, skillName: "Spellcraft", rank: 1 },
    { levelIndex: 2, skillName: "Listen", rank: 1 },
    { levelIndex: 2, skillName: "Spot", rank: 1 },
    { levelIndex: 2, skillName: "Heal", rank: 1 },
  ]);

  // General feats: floor(3/3)+1 = 2, +1 human bonus = 3
  await addFeats(db, ctx, levelIds, [
    { levelIndex: 0, featName: "Combat Casting", aptitude: "General" },
    { levelIndex: 0, featName: "Spell Focus: Conjuration", aptitude: "General" },
    { levelIndex: 2, featName: "Augment Summoning", aptitude: "General" },
    { levelIndex: 0, featName: "Wolf Animal Companion", aptitude: "Animal Companion Bond" },
  ]);

  // Druids know all spells on their list — no spell picks needed

  await addInventory(db, ctx, characterId, [
    { name: "Scimitar", quantity: 1, equipped: true, location: "Main Hand", weaponSet: 0 },
    { name: "Hide Armor", quantity: 1, equipped: true, location: "Torso" },
    { name: "Light Wooden Shield", quantity: 1, equipped: true, location: "Off Hand" },
  ]);

  await reconcileBondedForCharacter(db, characterId);
}
