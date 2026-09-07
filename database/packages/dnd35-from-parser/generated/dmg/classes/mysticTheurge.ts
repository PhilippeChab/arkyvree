import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const MYSTIC_THEURGE: ClassSeed = {
  name: "Mystic Theurge",
  description: "Mystic theurges bridge the gap between arcane and divine magic, channeling power drawn from both scholarly study and sacred devotion.",
  hd: 4, levels: 10, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Decipher Script",
    "Knowledge (Arcana)",
    "Knowledge (Religion)",
    "Profession",
    "Sense Motive",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.knowledgearcana.rank", 6),
    gte("skills.knowledgereligion.rank", 6),
    gte("spellcasting.divine", 2),
    gte("spellcasting.arcane", 2),
  ],
  casterLevelAdvancement: { type: "dual", levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  classFeatureAptitude: "Mystic Theurge Class Feature",
  classFeatures: [
    [1, "Spells per Day (Mystic Theurge)"],
    [1, "Weapon and Armor Proficiency (Mystic Theurge)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
