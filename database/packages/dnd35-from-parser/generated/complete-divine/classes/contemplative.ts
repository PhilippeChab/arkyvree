import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const CONTEMPLATIVE: ClassSeed = {
  name: "Contemplative",
  description: "Contemplatives dedicate themselves to deepening their spiritual connection with their patron deity.",
  hd: 6, levels: 10, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Diplomacy",
    "Heal",
    "Intimidate",
    "Knowledge (Religion)",
    "Profession",
    "Sense Motive",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.knowledgereligion.rank", 13),
    gte("spellcasting.divine", 1),
  ],
  casterLevelAdvancement: { type: "divine", levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  classFeatureAptitude: "Contemplative Class Feature",
  classFeatures: [
    [1, "Divine Health (Contemplative)"],
    [1, "Spells per Day/Spells Known (Contemplative)"],
    [1, "Weapon and Armor Proficiency (Contemplative)"],
    [2, "Slippery Mind (Contemplative)"],
    [3, "Divine Wholeness (Contemplative)"],
    [5, "Divine Body (Contemplative)"],
    [7, "Divine Soul (Contemplative)"],
    [9, "Eternal Body (Contemplative)"],
    [10, "Mystic Union (Contemplative)"],
  ],
  freeFeats: [
    [1, "Bonus Domain", "Contemplative Class Feature"],
    [6, "Bonus Domain", "Contemplative Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
