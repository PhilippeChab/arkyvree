import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const FATESPINNER: ClassSeed = {
  name: "Fatespinner",
  description: "A fatespinner has pulled back the curtain of chance, circumstance, and chaos to glimpse a deeper truth: probability.",
  hd: 4, levels: 5, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Appraise",
    "Concentration",
    "Craft",
    "Knowledge (Arcana)",
    "Profession",
    "Sleight of Hand",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.knowledgearcana.rank", 10),
    gte("skills.profession.rank", 5),
    gte("spellcasting.arcane", 4),
  ],
  casterLevelAdvancement: { type: "any", levels: [1, 2, 3, 4] },
  classFeatureAptitude: "Fatespinner Class Feature",
  classFeatures: [
    [1, "Spells per Day/Spells Known (Fatespinner)"],
    [1, "Spin Fate (Fatespinner)"],
    [1, "Weapon and Armor Proficiency (Fatespinner)"],
    [2, "Fickle Finger of Fate (Fatespinner)"],
    [3, "Spin Destiny (Fatespinner)"],
    [4, "Deny Fate (Fatespinner)"],
    [4, "Resist Fate (Fatespinner)"],
    [5, "Seal Fate (Fatespinner)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
