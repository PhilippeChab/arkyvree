import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const ACOLYTE_OF_THE_SKIN: ClassSeed = {
  name: "Acolyte of the Skin",
  description: "Acolytes of the skin seek to gain power by replacing their skin with that of a demon's.",
  hd: 8, levels: 10, skillPoints: 2,
  bab: "medium",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Intimidate",
    "Knowledge (Arcana)",
    "Knowledge (The Planes)",
    "Profession",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.knowledgetheplanes.rank", 6),
    or(
      eqStr("identity.beliefs.alignment", "Lawful Neutral"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Chaotic Neutral"),
      eqStr("identity.beliefs.alignment", "Lawful Evil"),
      eqStr("identity.beliefs.alignment", "Neutral Evil"),
      eqStr("identity.beliefs.alignment", "Chaotic Evil"),
    ),
  ],
  casterLevelAdvancement: { type: "any", levels: [2, 4, 6, 8, 10] },
  classFeatureAptitude: "Acolyte of the Skin Class Feature",
  classFeatures: [
    [1, "Poison (Acolyte of the Skin)"],
    [1, "Spells per Day/Spells Known (Acolyte of the Skin)"],
    [1, "Weapon and Armor Proficiency (Acolyte of the Skin)"],
    [1, "Wear Fiend (Acolyte of the Skin)"],
    [2, "Flame Resistant (Acolyte of the Skin)"],
    [3, "Fiendish Glare (Acolyte of the Skin)"],
    [5, "Poison (Acolyte of the Skin)"],
    [5, "Skin Adaptation (Acolyte of the Skin)"],
    [6, "Cold Resistant (Acolyte of the Skin)"],
    [7, "Glare of the Pit (Acolyte of the Skin)"],
    [9, "Summon Fiend (Acolyte of the Skin)"],
    [10, "Fiendish Symbiosis (Acolyte of the Skin)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
