import type { CharacterSeed } from "@/content/dnd3.5/builders/characters/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** Half-Elf Ranger 3 — Skills: (6+1)*4 + (6+1) + (6+1) = 42 */
export default {
  name: "Fenn Ashwalker",
  links: { race: "Half-Elf" },
  fields: {
    [CHARACTER_XP]: 3000,
    [CHARACTER_ALIGNMENT]: "Neutral Good",
    [CHARACTER_AGE]: 32,
    [CHARACTER_GENDER]: "Male",
    [CHARACTER_HEIGHT]: "178",
    [CHARACTER_WEIGHT]: "72",
  },
  description:
    "A half-elven ranger who patrols the borderlands between civilization and the deep forest. Fenn inherited his mother's keen elven senses and his father's stubborn human resolve. He tracks goblins and worse through the wilderness, protecting scattered hamlets that have no other guardian.",
  abilities: { Strength: 14, Dexterity: 16, Constitution: 12, Intelligence: 12, Wisdom: 14, Charisma: 10 },
  languages: ["Common", "Elven", "Goblin"],
  classes: [{ klass: "Ranger", hp: [8, 7, 6] }],
  // Total skills: 42
  skills: [
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
  ],
  // General feats: floor(3/3)+1 = 2 (Track + Endurance are free from Ranger)
  // Ranger Combat Style: Archery at L2 (grants Rapid Shot)
  // Favored Enemy (Ranger) grants 1 slot at L1 into the shared "Favored Enemy" aptitude
  feats: [
    { levelIndex: 0, featName: "Point Blank Shot", aptitude: "General" },
    { levelIndex: 0, featName: "Favored Enemy: Humanoid (Goblinoid)", aptitude: "Favored Enemy" },
    { levelIndex: 1, featName: "Rapid Shot", aptitude: "Ranger Combat Style (2nd)" },
    { levelIndex: 2, featName: "Precise Shot", aptitude: "General" },
  ],
  inventory: [
    { name: "Longbow", quantity: 1, location: "Two Handed", groups: [0] },
    { name: "Longsword", quantity: 1 },
    { name: "Studded Leather", quantity: 1, location: "Torso" },
  ],
} satisfies CharacterSeed;
