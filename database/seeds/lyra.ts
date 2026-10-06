import { type CharacterSeed } from "@/database/seeds/seedCharacter.ts";

/** Elf Rogue 3 — Skills: (8+2)*4 + (8+2)*2 = 60 */
export default {
  raceName: "Elf",
  name: "Lyra Shadowstep",
  xp: 3000,
  alignment: "Chaotic Neutral",
  age: 120,
  gender: "Female",
  height: "165",
  weight: "50",
  description:
    "A lithe elven rogue who slips through shadows like water. Lyra grew up in the back alleys of a port city, learning to survive by wit and nimble fingers.",
  abilities: { Strength: 10, Dexterity: 18, Constitution: 12, Intelligence: 14, Wisdom: 12, Charisma: 10 },
  languages: ["Common", "Elven"],
  classes: [{ klass: "Rogue", hp: [6, 5, 4] }],
  // Total skills: 60
  skills: [
    // L1 (40 points)
    { levelIndex: 0, skillName: "Hide", rank: 4 },
    { levelIndex: 0, skillName: "Move Silently", rank: 4 },
    { levelIndex: 0, skillName: "Open Lock", rank: 4 },
    { levelIndex: 0, skillName: "Disable Device", rank: 4 },
    { levelIndex: 0, skillName: "Search", rank: 4 },
    { levelIndex: 0, skillName: "Spot", rank: 4 },
    { levelIndex: 0, skillName: "Listen", rank: 4 },
    { levelIndex: 0, skillName: "Tumble", rank: 4 },
    { levelIndex: 0, skillName: "Bluff", rank: 4 },
    { levelIndex: 0, skillName: "Diplomacy", rank: 4 },
    // L2 (10 points)
    { levelIndex: 1, skillName: "Hide", rank: 1 },
    { levelIndex: 1, skillName: "Move Silently", rank: 1 },
    { levelIndex: 1, skillName: "Spot", rank: 1 },
    { levelIndex: 1, skillName: "Listen", rank: 1 },
    { levelIndex: 1, skillName: "Search", rank: 1 },
    { levelIndex: 1, skillName: "Disable Device", rank: 1 },
    { levelIndex: 1, skillName: "Escape Artist", rank: 1 },
    { levelIndex: 1, skillName: "Use Magic Device", rank: 1 },
    { levelIndex: 1, skillName: "Balance", rank: 1 },
    { levelIndex: 1, skillName: "Sense Motive", rank: 1 },
    // L3 (10 points)
    { levelIndex: 2, skillName: "Hide", rank: 1 },
    { levelIndex: 2, skillName: "Move Silently", rank: 1 },
    { levelIndex: 2, skillName: "Spot", rank: 1 },
    { levelIndex: 2, skillName: "Listen", rank: 1 },
    { levelIndex: 2, skillName: "Search", rank: 1 },
    { levelIndex: 2, skillName: "Disable Device", rank: 1 },
    { levelIndex: 2, skillName: "Tumble", rank: 1 },
    { levelIndex: 2, skillName: "Sleight of Hand", rank: 1 },
    { levelIndex: 2, skillName: "Gather Information", rank: 1 },
    { levelIndex: 2, skillName: "Intimidate", rank: 1 },
  ],
  // General feats: floor(3/3)+1 = 2
  feats: [
    { levelIndex: 0, featName: "Dodge", aptitude: "General" },
    { levelIndex: 2, featName: "Weapon Finesse", aptitude: "General" },
  ],
  inventory: [
    { name: "Shortsword", quantity: 1, equipped: true, location: "Main Hand", weaponSet: 0 },
    { name: "Dagger", quantity: 1, equipped: true, location: "Off Hand", weaponSet: 0 },
    { name: "Studded Leather", quantity: 1, equipped: true, location: "Torso" },
  ],
} satisfies CharacterSeed;
