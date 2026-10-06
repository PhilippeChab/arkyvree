import type { CharacterSeed } from "@/database/seeds/helpers.ts";

/** Human Fighter 5 — Skills, INT 12 (+1 mod, +1 human): (2+1+1)*4 + (2+1+1)*4 = 32 */
export default {
  raceName: "Human",
  name: "Bjorn Ironhand",
  xp: 10000,
  alignment: "Lawful Good",
  age: 25,
  gender: "Male",
  height: "185",
  weight: "90",
  description:
    "Bjorn is a battle-hardened warrior from the northern tribes. His muscular frame and numerous scars tell of his experiences in combat. He carries his family's ancestral greataxe and wears a bear pelt over his armor.",
  abilities: { Strength: 18, Dexterity: 14, Constitution: 16, Intelligence: 12, Wisdom: 10, Charisma: 8 },
  languages: ["Common", "Dwarven"],
  classes: [{ klass: "Fighter", hp: [10, 8, 7, 9, 6] }],
  skills: [
    // L1 (16 points)
    { levelIndex: 0, skillName: "Climb", rank: 4 },
    { levelIndex: 0, skillName: "Intimidate", rank: 4 },
    { levelIndex: 0, skillName: "Jump", rank: 4 },
    { levelIndex: 0, skillName: "Swim", rank: 4 },
    // L2 (4 points)
    { levelIndex: 1, skillName: "Climb", rank: 1 },
    { levelIndex: 1, skillName: "Jump", rank: 1 },
    { levelIndex: 1, skillName: "Swim", rank: 1 },
    { levelIndex: 1, skillName: "Handle Animal", rank: 1 },
    // L3 (4 points)
    { levelIndex: 2, skillName: "Climb", rank: 1 },
    { levelIndex: 2, skillName: "Intimidate", rank: 1 },
    { levelIndex: 2, skillName: "Swim", rank: 1 },
    { levelIndex: 2, skillName: "Handle Animal", rank: 1 },
    // L4 (4 points)
    { levelIndex: 3, skillName: "Jump", rank: 1 },
    { levelIndex: 3, skillName: "Swim", rank: 1 },
    { levelIndex: 3, skillName: "Handle Animal", rank: 1 },
    { levelIndex: 3, skillName: "Spot", rank: 1 },
    // L5 (4 points)
    { levelIndex: 4, skillName: "Intimidate", rank: 1 },
    { levelIndex: 4, skillName: "Climb", rank: 1 },
    { levelIndex: 4, skillName: "Handle Animal", rank: 1 },
    { levelIndex: 4, skillName: "Spot", rank: 1 },
  ],
  feats: [
    // General feats (3 slots: floor(5/3) + 1 + 1 human bonus)
    { levelIndex: 0, featName: "Power Attack", aptitude: "General" },
    { levelIndex: 0, featName: "Great Fortitude", aptitude: "General" },
    { levelIndex: 2, featName: "Cleave", aptitude: "General" },
    // Fighter Bonus Feats (3 slots: levels 1, 2, 4)
    { levelIndex: 0, featName: "Weapon Focus: Longsword", aptitude: "Fighter Bonus Feat" },
    { levelIndex: 1, featName: "Dodge", aptitude: "Fighter Bonus Feat" },
    { levelIndex: 3, featName: "Weapon Specialization: Longsword", aptitude: "Fighter Bonus Feat" },
  ],
  inventory: [
    { name: "Longsword", quantity: 1, equipped: true, location: "Main Hand", weaponSet: 0 },
    { name: "Chain Mail", quantity: 1, equipped: true, location: "Torso" },
    { name: "Heavy Steel Shield", quantity: 1, equipped: true, location: "Off Hand", weaponSet: 0 },
    { name: "Backpack (empty)", quantity: 1, equipped: true },
    { name: "Bedroll", quantity: 1 },
    { name: "Rope, hempen (50 ft.)", quantity: 1 },
    { name: "Rations, trail (per day)", quantity: 5 },
    { name: "Waterskin", quantity: 2 },
    { name: "Torch", quantity: 6 },
    { name: "Flint and steel", quantity: 1 },
  ],
} satisfies CharacterSeed;
