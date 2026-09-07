import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const DIVINE_ORACLE: ClassSeed = {
  name: "Divine Oracle",
  description: "Certain mortals possess the ability to receive and interpret divine messages, serving as oracles of the gods.",
  hd: 6, levels: 10, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Heal",
    "Intimidate",
    "Knowledge (Arcana)",
    "Knowledge (Religion)",
    "Profession",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.knowledgereligion.rank", 8),
    eq("feats.skillfocusknowledgereligion.possessed"),
  ],
  casterLevelAdvancement: { type: "any", levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  classFeatureAptitude: "Divine Oracle Class Feature",
  classFeatures: [
    [1, "Oracle Domain (Divine Oracle)"],
    [1, "Scry Bonus (Divine Oracle)"],
    [1, "Spells per Day/Spells Known (Divine Oracle)"],
    [1, "Weapon and Armor Proficiency (Divine Oracle)"],
    [2, "Prescient Sense (Divine Oracle)"],
    [2, "Trap Sense (Divine Oracle)"],
    [3, "Divination Enhancement (Divine Oracle)"],
    [4, "Uncanny Dodge (Dex Bonus to Ac) (Divine Oracle)"],
    [5, "Trap Sense (Divine Oracle)"],
    [6, "Improved Uncanny Dodge (Can't Be Flanked) (Divine Oracle)"],
    [8, "Trap Sense (Divine Oracle)"],
    [10, "Immune to Surprise (Divine Oracle)"],
  ],
  freeFeats: [
    [1, "Oracle Domain", "Cleric Domain"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
