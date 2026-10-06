import type { CharacterSeed } from "@/database/seeds/helpers.ts";

/** Human Monk 3 — Skills: (4+0+1)*4 + (4+0+1)*2 = 30 */
export default {
  raceName: "Human",
  name: "Zen Whitepetal",
  xp: 3000,
  alignment: "Lawful Neutral",
  age: 28,
  gender: "Male",
  height: "175",
  weight: "68",
  description:
    "A disciplined monk from the Monastery of the Falling Leaf. Zen seeks inner perfection through rigorous training and meditation, channeling his ki into devastating strikes.",
  abilities: { Strength: 14, Dexterity: 16, Constitution: 12, Intelligence: 10, Wisdom: 16, Charisma: 8 },
  languages: ["Common"],
  classes: [{ klass: "Monk", hp: [8, 6, 7] }],
  // Total skills: 30
  skills: [
    // L1 (20 points)
    { levelIndex: 0, skillName: "Balance", rank: 4 },
    { levelIndex: 0, skillName: "Tumble", rank: 4 },
    { levelIndex: 0, skillName: "Jump", rank: 4 },
    { levelIndex: 0, skillName: "Listen", rank: 4 },
    { levelIndex: 0, skillName: "Spot", rank: 4 },
    // L2 (5 points)
    { levelIndex: 1, skillName: "Balance", rank: 1 },
    { levelIndex: 1, skillName: "Tumble", rank: 1 },
    { levelIndex: 1, skillName: "Jump", rank: 1 },
    { levelIndex: 1, skillName: "Concentration", rank: 1 },
    { levelIndex: 1, skillName: "Spot", rank: 1 },
    // L3 (5 points)
    { levelIndex: 2, skillName: "Balance", rank: 1 },
    { levelIndex: 2, skillName: "Tumble", rank: 1 },
    { levelIndex: 2, skillName: "Listen", rank: 1 },
    { levelIndex: 2, skillName: "Spot", rank: 1 },
    { levelIndex: 2, skillName: "Concentration", rank: 1 },
  ],
  // General feats: floor(3/3)+1 = 2, +1 human bonus = 3
  // Monk bonus feats: L1 pick + L2 pick
  feats: [
    { levelIndex: 0, featName: "Dodge", aptitude: "General" },
    { levelIndex: 0, featName: "Improved Initiative", aptitude: "General" },
    { levelIndex: 0, featName: "Improved Grapple", aptitude: "Monk Bonus Feat (1st)" },
    { levelIndex: 1, featName: "Deflect Arrows", aptitude: "Monk Bonus Feat (2nd)" },
    { levelIndex: 2, featName: "Combat Reflexes", aptitude: "General" },
  ],
  inventory: [{ name: "Nunchaku", quantity: 1, equipped: true, location: "Main Hand", weaponSet: 0 }],
} satisfies CharacterSeed;
