import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const ARGENT_SAVANT: ClassSeed = {
  name: "Argent Savant",
  description: "The argent savant regards spells that evoke or apply magical force as the noblest and most fascinating spells at her disposal.",
  hd: 4, levels: 5, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Knowledge (Arcana)",
    "Knowledge (Architecture and Engineering)",
    "Knowledge (Dungeoneering)",
    "Knowledge (Geography)",
    "Knowledge (History)",
    "Knowledge (Local)",
    "Knowledge (Nature)",
    "Knowledge (Nobility and Royalty)",
    "Knowledge (Psionics)",
    "Knowledge (Religion)",
    "Knowledge (The Planes)",
    "Profession",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.knowledgearcana.rank", 6),
    gte("skills.spellcraft.rank", 12),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [2, 3, 4, 5] },
  classFeatureAptitude: "Argent Savant Class Feature",
  classFeatures: [
    [1, "Force Specialization (Argent Savant)"],
    [1, "Spells per Day/Spells Known (Argent Savant)"],
    [1, "Weapon and Armor Proficiency (Argent Savant)"],
    [2, "Force Armor (Argent Savant)"],
    [3, "Extended Force (Argent Savant)"],
    [4, "Ablate Force (Argent Savant)"],
    [5, "Unbind Force (Argent Savant)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
