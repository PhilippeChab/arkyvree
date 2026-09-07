import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const CHURCH_INQUISITOR: ClassSeed = {
  name: "Church Inquisitor",
  description: "The church inquisitor roots out corruption lurking within religious institutions and excises it.",
  hd: 8, levels: 10, skillPoints: 4,
  bab: "medium",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Bluff",
    "Concentration",
    "Decipher Script",
    "Diplomacy",
    "Gather Information",
    "Intimidate",
    "Knowledge (Arcana)",
    "Knowledge (Local)",
    "Knowledge (Religion)",
    "Knowledge (The Planes)",
    "Search",
    "Sense Motive",
    "Spellcraft",
    "Spot",
  ],
  requirements: [
    gte("skills.knowledgearcana.rank", 4),
    gte("skills.knowledgereligion.rank", 4),
    gte("skills.spellcraft.rank", 4),
    gte("saves.will.base", 3),
  ],
  casterLevelAdvancement: { type: "divine", levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  classFeatureAptitude: "Church Inquisitor Class Feature",
  classFeatures: [
    [1, "Detect Evil (Church Inquisitor)"],
    [1, "Inquisition Domain (Church Inquisitor)"],
    [1, "Spells per Day/Spells Known (Church Inquisitor)"],
    [1, "Weapon and Armor Proficiency (Church Inquisitor)"],
    [2, "Immune to Charms (Church Inquisitor)"],
    [3, "Pierce Illusion (Church Inquisitor)"],
    [4, "Pierce Disguise (Church Inquisitor)"],
    [5, "Immune to Compulsions (Church Inquisitor)"],
    [6, "Force Shapechange (Church Inquisitor)"],
    [8, "Immunity to Possession (Church Inquisitor)"],
    [9, "Discern Lies (Church Inquisitor)"],
    [10, "Learn the Truth (Church Inquisitor)"],
  ],
  freeFeats: [
    [1, "Inquisition Domain", "Cleric Domain"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
