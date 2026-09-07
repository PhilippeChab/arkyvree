import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const WAYFARER_GUIDE: ClassSeed = {
  name: "Wayfarer Guide",
  description: "The wayfarer guide focues on honing her skill at instantaneous magical transportation.",
  hd: 6, levels: 3, skillPoints: 2,
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
    "Speak Language",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.knowledgearcana.rank", 10),
    gte("skills.knowledgegeography.rank", 10),
  ],
  casterLevelAdvancement: { type: "any", levels: [1, 3] },
  classFeatureAptitude: "Wayfarer Guide Class Feature",
  classFeatures: [
    [1, "Enhanced Capacity (Wayfarer Guide)"],
    [1, "Improved Range (Wayfarer Guide)"],
    [1, "Spells per Day/Spells Known (Wayfarer Guide)"],
    [1, "Weapon and Armor Proficiency (Wayfarer Guide)"],
    [2, "Extra Teleportation (Wayfarer Guide)"],
    [3, "Enhanced Accuracy (Wayfarer Guide)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
